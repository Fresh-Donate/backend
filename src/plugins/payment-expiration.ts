import fp from 'fastify-plugin';
import { PaymentExpirationService } from '@/services/payment-expiration.service';

/**
 * Background sweeper that periodically transitions stale `pending`
 * payments to `expired`. Runs once at boot (so a long-stopped instance
 * catches up immediately) and then every {@link SWEEP_INTERVAL_MS}.
 */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export default fp(async (fastify) => {
  const service = new PaymentExpirationService();

  async function runSweep() {
    try {
      const n = await service.expireStalePayments();
      if (n > 0) {
        fastify.log.info(`Payment sweeper: expired ${n} stale pending payment(s)`);
      }
    } catch (err) {
      fastify.log.error({ err }, 'Payment sweeper failed');
    }
  }

  void runSweep();

  const handle = setInterval(runSweep, SWEEP_INTERVAL_MS);
  // Don't keep the event loop alive just for this timer.
  handle.unref();

  fastify.addHook('onClose', async () => {
    clearInterval(handle);
  });
});
