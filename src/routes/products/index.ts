import { type FastifyPluginAsync } from 'fastify';
import { ProductService } from '@/services/product.service';
import type { CreateProductDto, UpdateProductDto } from '@/types';

const productBodySchema = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' as const, minLength: 1, maxLength: 128 },
    price: { type: 'number' as const, minimum: 0.01 },
    currency: { type: 'string' as const, minLength: 1, maxLength: 8 },
    quantity: { type: 'integer' as const, minimum: 0 },
    description: { type: 'string' as const, maxLength: 1000 },
    type: { type: 'string' as const, minLength: 1, maxLength: 32 },
    commands: { type: 'array' as const, items: { type: 'string' as const } },
    imageUrl: { type: 'string' as const, maxLength: 512 },
    allowCustomCount: { type: 'boolean' as const },
    forceDelivery: { type: 'boolean' as const },
  },
};

const productRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new ProductService();

  fastify.get('/', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return service.findAll();
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return service.findById(request.params.id);
  });

  fastify.post<{ Body: CreateProductDto }>('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        ...productBodySchema,
        required: ['name', 'price', 'currency', 'quantity', 'type', 'allowCustomCount'],
      },
    },
  }, async (request, reply) => {
    const product = await service.create(request.body);
    return reply.code(201).send(product);
  });

  fastify.put<{
    Params: { id: string };
    Body: UpdateProductDto;
  }>('/:id', {
    onRequest: [fastify.authenticate],
    schema: { body: productBodySchema },
  }, async (request) => {
    return service.update(request.params.id, request.body);
  });

  fastify.delete<{ Params: { id: string } }>('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    await service.delete(request.params.id);
    return reply.code(204).send();
  });

  fastify.post<{ Params: { id: string } }>('/:id/duplicate', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const product = await service.duplicate(request.params.id);
    return reply.code(201).send(product);
  });
};

export default productRoutes;
