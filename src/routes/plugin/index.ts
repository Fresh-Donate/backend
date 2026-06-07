import { type FastifyPluginAsync, type FastifyRequest, type FastifyReply } from 'fastify';
import { Op } from 'sequelize';
import { Payment } from '@/models/payment.model';
import { PaymentItem } from '@/models/payment-item.model';
import { Product } from '@/models/product.model';
import { Server } from '@/models/server.model';
import { PaymentDelivery } from '@/models/payment-delivery.model';
import { SettingsService } from '@/services/settings.service';
import { ServerService } from '@/services/server.service';
import { buildCommandVariables, resolveCommandVariables } from '@/utils/command-variables';

interface DeliveryEntry {
  paymentId: string;
  playerNickname: string;
  productName: string;
  commands: string[];
  requireOnline: boolean;
}

async function buildDeliveryEntry(payment: Payment, serverId?: string): Promise<DeliveryEntry | null> {
  const items = await PaymentItem.findAll({
    where: { paymentId: payment.id },
    order: [['created_at', 'ASC']],
  });

  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = productIds.length > 0
    ? await Product.findAll({
      where: { id: productIds },
      include: [{ model: Server, through: { attributes: [] }, required: false }],
    })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const commands: string[] = [];
  let requireOnline = false;
  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product) continue;
    if (serverId && !(product.servers || []).some((s) => s.id === serverId)) continue;
    const rawCommands = product.commands || [];
    if (rawCommands.length === 0) continue;
    const variables = buildCommandVariables(payment, product, item);
    for (const cmd of rawCommands) {
      commands.push(resolveCommandVariables(cmd, variables));
    }
    // requireOnline for the batch is conservative: if any line needs the
    // player online, the whole batch is held until they are.
    if (!product.forceDelivery) requireOnline = true;
  }

  if (commands.length === 0) return null;

  return {
    paymentId: payment.id,
    playerNickname: payment.customerNickname || '',
    productName: payment.itemsCount > 1 ? `Заказ из ${payment.itemsCount} товаров` : payment.productName,
    commands,
    requireOnline,
  };
}

const settingsService = new SettingsService();
const serverService = new ServerService();

// Auth flow:
//   1. X-Api-Key is ALWAYS the global settings.plugin_config.token. It
//      authenticates the plugin regardless of mode - like before.
//   2. multi_server_enabled=true: X-Server-Id additionally tells the backend
//      which server this plugin represents. Used for routing PaymentDelivery
//      rows. The id alone is NOT a credential; without a valid api key it
//      grants nothing.
//   3. multi_server_enabled=false (legacy): X-Server-Id is ignored.
async function authenticatePlugin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = request.headers['x-api-key'];
  if (typeof apiKey !== 'string' || !apiKey) {
    return reply.code(401).send({ error: 'Missing X-Api-Key header' });
  }

  const settings = await settingsService.get();

  if (!settings.plugin_config.token || apiKey !== settings.plugin_config.token) {
    return reply.code(403).send({ error: 'Invalid API key' });
  }

  if (settings.multi_server_enabled) {
    const serverIdHeader = request.headers['x-server-id'];
    if (typeof serverIdHeader !== 'string' || !serverIdHeader) {
      return reply.code(400).send({ error: 'Missing X-Server-Id header (multi-server mode is on)' });
    }
    const server = await serverService.findByAuthKey(serverIdHeader);
    if (!server) {
      return reply.code(403).send({ error: 'Unknown server id' });
    }
    (request as any).pluginServerId = server.id;
  }
}

const pluginRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {

  fastify.get('/ping', {
    preHandler: authenticatePlugin,
  }, async (request) => {
    const serverId = (request as any).pluginServerId as string | undefined;
    return { status: 'ok', serverId: serverId || null };
  });

  fastify.get('/deliveries/pending', {
    preHandler: authenticatePlugin,
  }, async (request) => {
    const serverId = (request as any).pluginServerId as string | undefined;

    if (serverId) {
      // Multi-server: pull pending PaymentDelivery rows for THIS server only.
      const deliveries = await PaymentDelivery.findAll({
        where: { serverId, status: 'pending' },
        order: [['created_at', 'ASC']],
        limit: 50,
      });

      const result: DeliveryEntry[] = [];

      for (const delivery of deliveries) {
        const payment = await Payment.findByPk(delivery.paymentId);
        if (!payment) continue;
        // Defensive: payment may have been refunded/failed after rows were
        // created - skip those instead of replaying commands.
        if (payment.status !== 'paid') continue;

        const entry = await buildDeliveryEntry(payment, serverId);
        if (entry) result.push(entry);
      }

      return result;
    }

    // Legacy single-server: existing behaviour. Plugins built before multi-
    // server poll here with the global token and consume Payment rows directly.
    const payments = await Payment.findAll({
      where: { status: 'paid' },
      order: [['created_at', 'ASC']],
      limit: 50,
    });

    const result: DeliveryEntry[] = [];

    for (const payment of payments) {
      const entry = await buildDeliveryEntry(payment);
      if (entry) result.push(entry);
    }

    return result;
  });

  fastify.post<{
    Params: { paymentId: string };
    Body: {
      success: boolean;
      logs: Array<{ command: string; success: boolean; response: string }>;
    };
  }>('/deliveries/:paymentId/result', {
    preHandler: authenticatePlugin,
    schema: {
      body: {
        type: 'object' as const,
        required: ['success', 'logs'],
        properties: {
          success: { type: 'boolean' as const },
          logs: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                command: { type: 'string' as const },
                success: { type: 'boolean' as const },
                response: { type: 'string' as const },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { paymentId } = request.params;
    const { success, logs } = request.body;
    const serverId = (request as any).pluginServerId as string | undefined;

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      return reply.code(404).send({ error: 'Payment not found' });
    }

    if (serverId) {
      // Multi-server: update the PaymentDelivery row for this (payment, server)
      // pair only. Payment.status flips to 'delivered' once every bound server
      // reports success - partial completion stays in 'paid'.
      const delivery = await PaymentDelivery.findOne({ where: { paymentId, serverId } });
      if (!delivery) {
        return reply.code(404).send({ error: 'No pending delivery for this server' });
      }

      // Idempotency: a plugin that already reported success might retry the
      // POST (network blip, restart). Don't overwrite a final state - just
      // ack so the plugin stops nagging us.
      if (delivery.status === 'delivered') {
        return { status: 'ok', paymentStatus: payment.status, deliveryStatus: 'delivered', alreadyReported: true };
      }

      const existingLogs = (delivery.meta?.deliveryLogs as any[] | undefined) || [];
      const attempt = existingLogs.length + 1;

      const deliveryLog = {
        attempt,
        timestamp: new Date().toISOString(),
        success,
        results: logs.map((l) => ({
          command: l.command,
          success: l.success,
          response: l.response,
        })),
        source: 'plugin',
        serverId,
      };

      const newDeliveryMeta = { ...delivery.meta, deliveryLogs: [...existingLogs, deliveryLog] };

      if (success) {
        await delivery.update({
          status: 'delivered',
          deliveredAt: new Date(),
          meta: newDeliveryMeta,
        });
      } else {
        await delivery.update({ meta: newDeliveryMeta });
        delivery.changed('meta', true);
        await delivery.save();
      }

      // Roll up: when no pending rows remain for this payment, the buyer is
      // fully delivered. We don't auto-fail on partial server failures - the
      // plugin retries on its end and the admin can also retry from the panel.
      const stillPending = await PaymentDelivery.count({
        where: { paymentId, status: { [Op.in]: ['pending', 'failed'] as ('pending' | 'failed')[] } },
      });
      if (stillPending === 0 && payment.status === 'paid') {
        await payment.update({
          status: 'delivered',
          deliveredAt: new Date(),
        });
      }

      return { status: 'ok', paymentStatus: payment.status, deliveryStatus: success ? 'delivered' : 'failed' };
    }

    // Legacy single-server path.
    if (payment.status !== 'paid') {
      return reply.code(400).send({ error: 'Payment is not in paid status' });
    }

    const existingLogs = payment.meta?.deliveryLogs || [];
    const attempt = existingLogs.length + 1;

    const deliveryLog = {
      attempt,
      timestamp: new Date().toISOString(),
      success,
      results: logs.map((l) => ({
        command: l.command,
        success: l.success,
        response: l.response,
      })),
      source: 'plugin',
    };

    const newLogs = [...existingLogs, deliveryLog];
    const newMeta = { ...payment.meta, deliveryLogs: newLogs };

    if (success) {
      await payment.update({
        status: 'delivered',
        deliveredAt: new Date(),
        meta: newMeta,
      });
    } else {
      await payment.update({ meta: newMeta });
      payment.changed('meta', true);
      await payment.save();
    }

    return { status: 'ok', paymentStatus: payment.status };
  });
};

export default pluginRoutes;
