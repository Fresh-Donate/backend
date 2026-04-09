import { FastifyPluginAsync } from 'fastify';
import { CustomerService } from '@/services/customer.service';
import { PaymentService } from '@/services/payment.service';

const customerRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const customerService = new CustomerService();
  const paymentService = new PaymentService();

  // GET /customers — admin only
  fastify.get<{
    Querystring: { search?: string; limit?: string; offset?: string };
  }>('/', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { search, limit, offset } = request.query;
    return customerService.findAll({
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  });

  // GET /customers/:id — admin only
  fastify.get<{ Params: { id: string } }>('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const customer = await customerService.findById(request.params.id);
    if (!customer) return reply.code(404).send({ error: 'Customer not found' });
    return customer;
  });

  // GET /customers/:id/payments — admin only
  fastify.get<{ Params: { id: string } }>('/:id/payments', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    return paymentService.findByCustomerId(request.params.id);
  });
};

export default customerRoutes;
