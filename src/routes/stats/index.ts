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

  // GET /stats/chart — admin only, revenue chart data
  fastify.get<{
    Querystring: { from: string; to: string; period?: string; currency?: string };
  }>('/chart', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { from, to, period, currency } = request.query;
    return paymentService.getRevenueChart({
      from,
      to,
      period: (period as 'daily' | 'weekly' | 'monthly') || 'daily',
      currency,
    });
  });
};

export default statsRoutes;
