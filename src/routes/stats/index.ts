import { FastifyPluginAsync } from 'fastify';
import { PaymentService } from '@/services/payment.service';

const statsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const paymentService = new PaymentService();

  // GET /stats — admin only, dashboard stats
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async () => {
    return paymentService.getStats();
  });
};

export default statsRoutes;
