import { type FastifyPluginAsync } from 'fastify';
import { Payment } from '@/models/payment.model';
import { Product } from '@/models/product.model';
import { Customer } from '@/models/customer.model';
import { SettingsService } from '@/services/settings.service';

const settingsService = new SettingsService();

/**
 * Authenticate plugin requests via X-Api-Key header
 */
async function authenticatePlugin(request: any, reply: any): Promise<void> {
  const apiKey = request.headers['x-api-key'];
  if (!apiKey) {
    return reply.code(401).send({ error: 'Missing X-Api-Key header' });
  }

  const settings = await settingsService.get();
  if (!settings.plugin_config.token || apiKey !== settings.plugin_config.token) {
    return reply.code(403).send({ error: 'Invalid API key' });
  }
}

const pluginRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {

  // GET /plugin/ping — verify connection and API key
  fastify.get('/ping', {
    preHandler: authenticatePlugin,
  }, async () => {
    return { status: 'ok' };
  });

  // GET /plugin/deliveries/pending — get payments awaiting plugin delivery
  fastify.get('/deliveries/pending', {
    preHandler: authenticatePlugin,
  }, async () => {
    const payments = await Payment.findAll({
      where: {
        status: 'paid',
      },
      include: [
        { model: Customer, required: false },
      ],
      order: [['created_at', 'ASC']],
      limit: 50,
    });

    // Filter to those with commands (need product lookup)
    const result = [];

    for (const payment of payments) {
      const product = await Product.findByPk(payment.productId);
      if (!product) continue;

      const commands = product.commands || [];
      if (commands.length === 0) continue;

      result.push({
        paymentId: payment.id,
        playerNickname: payment.customer?.nickname || '',
        productName: payment.productName,
        commands,
        requireOnline: true,
      });
    }

    return result;
  });

  // POST /plugin/deliveries/:paymentId/result — report delivery result
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

    const payment = await Payment.findByPk(paymentId, {
      include: [{ model: Customer, required: false }],
    });

    if (!payment) {
      return reply.code(404).send({ error: 'Payment not found' });
    }

    if (payment.status !== 'paid') {
      return reply.code(400).send({ error: 'Payment is not in paid status' });
    }

    // Build delivery log entry
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
