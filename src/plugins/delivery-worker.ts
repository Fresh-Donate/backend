import fp from 'fastify-plugin';
import { DeliveryService } from '@/services/delivery.service';

const TICK_MS = 30 * 1000;

export default fp(async (fastify) => {
  if (process.env.SKIP_DB === 'true') return;

  const service = new DeliveryService();
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      await service.processDue();
    } catch (err) {
      fastify.log.error({ err }, 'Delivery worker failed');
    } finally {
      running = false;
    }
  }

  fastify.addHook('onReady', async () => {
    void tick();
  });

  const handle = setInterval(tick, TICK_MS);
  handle.unref();

  fastify.addHook('onClose', async () => {
    clearInterval(handle);
  });
});
