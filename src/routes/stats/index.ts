import { type FastifyPluginAsync } from 'fastify';
import { PaymentService } from '@/services/payment.service';

const statsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const paymentService = new PaymentService();

  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async () => {
    return paymentService.getStats();
  });

  fastify.get<{
    Querystring: { from: string; to: string; period?: string; currency?: string };
  }>('/chart', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { from, to, period, currency } = request.query;
    return paymentService.getRevenueChart({
      from,
      to,
      period: (period as 'hourly' | 'daily' | 'weekly' | 'monthly') || 'daily',
      currency,
    });
  });

  fastify.get<{
    Querystring: { from: string; to: string; currency?: string };
  }>('/summary', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { from, to, currency } = request.query;
    return paymentService.getSummary({ from, to, currency });
  });
};

export default statsRoutes;
