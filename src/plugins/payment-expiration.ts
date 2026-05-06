import fp from 'fastify-plugin';
import { PaymentExpirationService } from '@/services/payment-expiration.service';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Runs once at boot (so a long-stopped instance catches up immediately) and
// then every SWEEP_INTERVAL_MS. unref() so this timer can't keep the event
// loop alive on its own.
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
  handle.unref();

  fastify.addHook('onClose', async () => {
    clearInterval(handle);
  });
});
