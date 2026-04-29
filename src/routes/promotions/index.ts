import { type FastifyPluginAsync } from 'fastify';
import { PromotionService } from '@/services/promotion.service';

const promotionBodySchema = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' as const, minLength: 1, maxLength: 128 },
    discountPercent: { type: 'integer' as const, minimum: 1, maximum: 100 },
    startsAt: { type: 'string' as const, format: 'date-time' as const },
    endsAt: { type: 'string' as const, format: 'date-time' as const },
    productIds: { type: 'array' as const, items: { type: 'string' as const } },
  },
};

const promotionRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new PromotionService();

  // GET /promotions — admin only
  fastify.get('/', { onRequest: [fastify.authenticate] }, async () => {
    return service.findAll();
  });

  // GET /promotions/:id — admin only
  fastify.get<{ Params: { id: string } }>('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    return service.findById(request.params.id);
  });

  fastify.post<{
    Body: {
      name: string;
      discountPercent: number;
      startsAt: string;
      endsAt: string;
      productIds?: string[];
    };
  }>('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        ...promotionBodySchema,
        required: ['name', 'discountPercent', 'startsAt', 'endsAt'],
      },
    },
  }, async (request, reply) => {
    const promotion = await service.create({
      name: request.body.name,
      discountPercent: request.body.discountPercent,
      startsAt: request.body.startsAt,
      endsAt: request.body.endsAt,
      productIds: request.body.productIds || [],
    });
    return reply.code(201).send(promotion);
  });

  fastify.put<{
    Params: { id: string };
    Body: {
      name?: string;
      discountPercent?: number;
      startsAt?: string;
      endsAt?: string;
      productIds?: string[];
    };
  }>('/:id', {
    onRequest: [fastify.authenticate],
    schema: { body: promotionBodySchema },
  }, async (request) => {
    return service.update(request.params.id, request.body);
  });

  fastify.delete<{ Params: { id: string } }>('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    await service.delete(request.params.id);
    return reply.code(204).send();
  });
};

export default promotionRoutes;
