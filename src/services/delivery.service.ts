import { Payment } from '@/models/payment.model';
import { Product } from '@/models/product.model';
import { Customer } from '@/models/customer.model';
import { RconService } from './rcon.service';
import { SettingsService } from './settings.service';
import { buildCommandVariables } from '@/utils/command-variables';
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

    // Plugin delivery: skip RCON, plugin polls /plugin/pending and picks it up.
    if (settings.delivery_method === 'plugin') {
      return;
    }

    const payment = await Payment.findByPk(paymentId, {
      include: [{ model: Customer, required: false }],
    });
    if (!payment) return;
    if (payment.status !== 'paid') return;

    const product = await Product.findByPk(payment.productId);
    if (!product) return;

    const commands = product.commands || [];
    if (commands.length === 0) {
      await payment.update({
        status: 'delivered',
        deliveredAt: new Date(),
      });
      return;
    }

    // Deep copy to avoid Sequelize JSONB mutation detection issues.
    const logs: DeliveryLog[] = [...(payment.meta?.deliveryLogs || [])];
    const attempt = logs.length + 1;

    try {
      const results = await this.rconService.executeCommands(
        commands,
        buildCommandVariables(payment, product),
      );

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

    await this.attemptDelivery(paymentId);
  }
}
