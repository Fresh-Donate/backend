import { type FastifyPluginAsync } from 'fastify';
import { CustomerService } from '@/services/customer.service';
import { PaymentService } from '@/services/payment.service';

function parseDate(value: string | undefined): Date | undefined | null {
  if (value === undefined || value === '') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

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
      from?: string;
      to?: string;
    };
  }>('/', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { search, limit, offset, sortBy, sortOrder } = request.query;

    const from = parseDate(request.query.from);
    const to = parseDate(request.query.to);
    if (from === null || to === null) {
      return reply.code(400).send({ error: 'Invalid `from` or `to` - expected an ISO date' });
    }

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
      from,
      to,
    });
  });

  fastify.get<{
    Params: { nickname: string };
    Querystring: { from?: string; to?: string };
  }>('/:nickname', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const from = parseDate(request.query.from);
    const to = parseDate(request.query.to);
    if (from === null || to === null) {
      return reply.code(400).send({ error: 'Invalid `from` or `to` - expected an ISO date' });
    }

    const customer = await customerService.findById(request.params.nickname, { from, to });
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
