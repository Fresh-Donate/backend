import { type FastifyPluginAsync } from 'fastify';
import { CustomerService } from '@/services/customer.service';
import { PaymentService } from '@/services/payment.service';

const customerRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const customerService = new CustomerService();
  const paymentService = new PaymentService();

  fastify.get<{
    Querystring: {
      search?: string;
      limit?: string;
      offset?: string;
      sortBy?: string;
      sortOrder?: string;
    };
  }>('/', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { search, limit, offset, sortBy, sortOrder } = request.query;

    // Whitelist sort params — protects against arbitrary SQL identifiers
    // sneaking into the ORDER clause via the literal() branch in the service.
    const allowedSortBy = ['nickname', 'email', 'createdAt', 'purchaseCount', 'totalSpent'] as const;
    type SortBy = typeof allowedSortBy[number];
    const validSortBy: SortBy | undefined = (allowedSortBy as readonly string[]).includes(sortBy ?? '')
      ? (sortBy as SortBy)
      : undefined;
    const validSortOrder: 'asc' | 'desc' | undefined =
      sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : undefined;

    return customerService.findAll({
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      sortBy: validSortBy,
      sortOrder: validSortOrder,
    });
  });

  // Customer key is the Minecraft nickname — there's no stored UUID anymore,
  // customer data is aggregated from `payments` on the fly.
  fastify.get<{ Params: { nickname: string } }>('/:nickname', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const customer = await customerService.findById(request.params.nickname);
    if (!customer) return reply.code(404).send({ error: 'Customer not found' });
    return customer;
  });

  fastify.get<{ Params: { nickname: string } }>('/:nickname/payments', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    return paymentService.findByNickname(request.params.nickname);
  });
};

export default customerRoutes;
