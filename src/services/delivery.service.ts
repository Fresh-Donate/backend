import { Payment } from '@/models/payment.model';
import { PaymentItem } from '@/models/payment-item.model';
import { Product } from '@/models/product.model';
import { Server } from '@/models/server.model';
import { PaymentDelivery } from '@/models/payment-delivery.model';
import { RconService } from './rcon.service';
import { SettingsService } from './settings.service';
import { buildCommandVariables, resolveCommandVariables } from '@/utils/command-variables';
import type { DeliveryLog } from '@/types';

const RETRY_DELAYS = [
  1 * 60 * 1000,
  3 * 60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
];

const MAX_ATTEMPTS = RETRY_DELAYS.length + 1;

const scheduledRetries = new Set<string>();

export class DeliveryService {
  private rconService = new RconService();
  private settingsService = new SettingsService();

  async attemptDelivery(paymentId: string): Promise<void> {
    const settings = await this.settingsService.get();

    if (settings.delivery_method === 'plugin') {
      if (settings.multi_server_enabled) {
        await this.fanOutToServers(paymentId);
      }
      return;
    }

    const payment = await Payment.findByPk(paymentId, {
      include: [{ model: PaymentItem, required: false }],
    });
    if (!payment) return;
    if (payment.status !== 'paid') return;

    // Resolve commands across every line item. Each item's commands are
    // rendered with its own snapshot (count / product name), then flattened
    // into a single RCON batch so the legacy single-product flow is just the
    // N=1 case.
    const resolvedCommands = await this.resolveOrderCommands(payment);
    if (resolvedCommands.length === 0) {
      await payment.update({
        status: 'delivered',
        deliveredAt: new Date(),
      });
      return;
    }

    const logs: DeliveryLog[] = [...(payment.meta?.deliveryLogs || [])];
    const attempt = logs.length + 1;

    try {
      // Commands are already variable-resolved; pass an empty variable map.
      const results = await this.rconService.executeCommands(resolvedCommands, {});

      const allSucceeded = results.every((r) => r.success);

      logs.push({
        attempt,
        timestamp: new Date().toISOString(),
        success: allSucceeded,
        results,
      });

      const newMeta = { ...payment.meta, deliveryLogs: logs };

      if (allSucceeded) {
        await payment.update({
          status: 'delivered',
          deliveredAt: new Date(),
          meta: newMeta,
        });
        scheduledRetries.delete(paymentId);
      } else {
        await payment.update({ meta: newMeta });
        payment.changed('meta', true);
        await payment.save();
        this.scheduleRetryOrFail(paymentId, attempt);
      }
    } catch (err) {
      logs.push({
        attempt,
        timestamp: new Date().toISOString(),
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });

      await payment.update({ meta: { ...payment.meta, deliveryLogs: logs } });
      payment.changed('meta', true);
      await payment.save();
      this.scheduleRetryOrFail(paymentId, attempt);
    }
  }

  // Load the order's line items together with their (current) products,
  // including server bindings. Products deleted after purchase are simply
  // absent from the map - their commands can no longer be executed.
  private async loadItemsWithProducts(
    payment: Payment,
  ): Promise<{ items: PaymentItem[]; productById: Map<string, Product> }> {
    const items = (payment.items as PaymentItem[] | undefined)
      ?? await PaymentItem.findAll({ where: { paymentId: payment.id } });

    const productIds = [...new Set(items.map((i) => i.productId))];
    const products = productIds.length > 0
      ? await Product.findAll({
        where: { id: productIds },
        include: [{ model: Server, through: { attributes: [] }, required: false }],
      })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));
    return { items, productById };
  }

  // Flatten an order into fully variable-resolved commands. When `serverId`
  // is given, only items whose product is bound to that server contribute -
  // this is how one cart fans different products to different servers.
  private async resolveOrderCommands(payment: Payment, serverId?: string): Promise<string[]> {
    const { items, productById } = await this.loadItemsWithProducts(payment);
    const out: string[] = [];
    for (const item of items) {
      const product = productById.get(item.productId);
      if (!product) continue;
      if (serverId && !(product.servers || []).some((s) => s.id === serverId)) continue;
      const vars = buildCommandVariables(payment, product, item);
      for (const cmd of product.commands || []) {
        out.push(resolveCommandVariables(cmd, vars));
      }
    }
    return out;
  }

  private async fanOutToServers(paymentId: string): Promise<void> {
    const payment = await Payment.findByPk(paymentId, {
      include: [{ model: PaymentItem, required: false }],
    });
    if (!payment) return;
    if (payment.status !== 'paid') return;

    const { items, productById } = await this.loadItemsWithProducts(payment);

    // Servers to fan out to = union of every item's product server bindings.
    const serverIds = [...new Set(
      items.flatMap((i) => (productById.get(i.productId)?.servers || []).map((s) => s.id)),
    )];

    // Nothing executable anywhere (no commands across all items): mark done.
    const hasCommands = items.some((i) => (productById.get(i.productId)?.commands || []).length > 0);
    if (!hasCommands) {
      await payment.update({
        status: 'delivered',
        deliveredAt: new Date(),
      });
      return;
    }

    if (serverIds.length === 0) {
      await payment.update({
        status: 'failed',
        meta: {
          ...payment.meta,
          deliveryFailure: 'no_servers_bound_at_payment_time',
        },
      });
      payment.changed('meta', true);
      await payment.save();
      return;
    }

    for (const serverId of serverIds) {
      await PaymentDelivery.findOrCreate({
        where: { paymentId, serverId },
        defaults: { paymentId, serverId },
      });
    }
  }

  private scheduleRetryOrFail(
    paymentId: string,
    currentAttempt: number,
  ): void {
    if (currentAttempt >= MAX_ATTEMPTS) {
      void Payment.findByPk(paymentId).then(async (payment) => {
        if (payment && payment.status === 'paid') {
          await payment.update({ status: 'failed' });
        }
      });
      scheduledRetries.delete(paymentId);
      return;
    }

    if (scheduledRetries.has(paymentId)) return;
    scheduledRetries.add(paymentId);

    const delay = RETRY_DELAYS[currentAttempt - 1];
    setTimeout(() => {
      scheduledRetries.delete(paymentId);
      void this.attemptDelivery(paymentId);
    }, delay);
  }

  async retryDelivery(paymentId: string): Promise<void> {
    const payment = await Payment.findByPk(paymentId);
    if (!payment) return;

    if (payment.status === 'failed' || payment.status === 'paid') {
      const newMeta = {
        ...payment.meta,
        deliveryLogs: [],
        previousDeliveryLogs: [
          ...(payment.meta?.previousDeliveryLogs || []),
          ...(payment.meta?.deliveryLogs || []),
        ],
      };
      await payment.update({
        status: 'paid',
        meta: newMeta,
      });
      payment.changed('meta', true);
      await payment.save();
    }

    const settings = await this.settingsService.get();
    if (settings.delivery_method === 'plugin' && settings.multi_server_enabled) {
      await PaymentDelivery.update(
        { status: 'pending', deliveredAt: null },
        { where: { paymentId } },
      );
    }

    await this.attemptDelivery(paymentId);
  }
}
