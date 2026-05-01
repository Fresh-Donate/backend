import { type FastifyPluginAsync } from 'fastify';
import { PaymentService } from '@/services/payment.service';
import { DeliveryService } from '@/services/delivery.service';
import type { PaymentStatus } from '@/models/payment.model';

const paymentRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new PaymentService();
  const deliveryService = new DeliveryService();

  // POST /payments — public (shop creates payment)
  fastify.post<{
    Body: {
      productId: string;
      nickname: string;
      email: string;
      paymentOptionId: string;
      count?: number;
    };
  }>('/', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['productId', 'nickname', 'email', 'paymentOptionId'],
        properties: {
          productId: { type: 'string' as const },
          // Minecraft Java Edition username rules — 3..16 chars of
          // [a-zA-Z0-9_]. Mirrored in shop UI Zod schema; keep the two in
          // sync. Bedrock players with spaces/longer names are rare on
          // Java-targeted donate shops, so we don't loosen this.
          nickname: {
            type: 'string' as const,
            minLength: 3,
            maxLength: 16,
            pattern: '^[a-zA-Z0-9_]+$',
          },
          email: { type: 'string' as const, format: 'email', maxLength: 256 },
          count: { type: 'number' as const, minimum: 1, maximum: 100000 },
          paymentOptionId: { type: 'string' as const },
        },
      },
    },
  }, async (request, reply) => {
    const payment = await service.create(request.body);
    return reply.code(201).send(payment);
  });

  // POST /payments/preview — public. Given (productId, nickname), returns
  // the unit price the buyer will actually be charged after promo + upgrade
  // («доплата») discounts. Lets the shop modal show the real number before
  // the buyer commits, instead of letting them discover it on the YooKassa
  // page. Empty `nickname` returns the promo-aware price with no upgrade.
  fastify.post<{
    Body: { productId: string; nickname?: string };
  }>('/preview', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['productId'],
        properties: {
          productId: { type: 'string' as const },
          nickname: { type: 'string' as const, maxLength: 16 },
        },
      },
    },
  }, async (request) => {
    return service.previewPrice(request.body.nickname || '', request.body.productId);
  });

  // GET /payments/:id/status — public, check payment status (for return page polling)
  fastify.get<{ Params: { id: string } }>('/:id/status', async (request, reply) => {
    const payment = await service.findById(request.params.id);
    if (!payment) return reply.code(404).send({ error: 'Payment not found' });
    return {
      id: payment.id,
      status: payment.status,
      productName: payment.productName,
      totalAmount: payment.totalAmount,
      currency: payment.currency,
    };
  });

  // GET /payments — admin only, list all payments
  fastify.get<{
    Querystring: {
      status?: PaymentStatus;
      search?: string;
      limit?: string;
      offset?: string;
    };
  }>('/', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { status, search, limit, offset } = request.query;
    return service.findAll({
      status,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  });

  // GET /payments/:id — admin only
  fastify.get<{ Params: { id: string } }>('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const payment = await service.findById(request.params.id);
    if (!payment) return reply.code(404).send({ error: 'Payment not found' });
    return payment;
  });

  // POST /payments/:id/confirm — webhook / admin manual confirm
  fastify.post<{ Params: { id: string } }>('/:id/confirm', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    return service.confirmPayment(request.params.id);
  });

  // POST /payments/:id/retry-delivery — admin manual retry delivery
  fastify.post<{ Params: { id: string } }>('/:id/retry-delivery', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    await deliveryService.retryDelivery(request.params.id);
    const payment = await service.findById(request.params.id);
    if (!payment) return reply.code(404).send({ error: 'Payment not found' });
    return payment;
  });
};

export default paymentRoutes;
