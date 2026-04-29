import { type FastifyPluginAsync } from 'fastify';
import { ProductService } from '@/services/product.service';

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
  },
};

const productRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new ProductService();

  // GET /products — public (shop needs this)
  fastify.get('/', async () => {
    return service.findAll();
  });

  // GET /products/:id — public
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    return service.findById(request.params.id);
  });

  // POST /products — admin only
  fastify.post<{
    Body: {
      name: string;
      price: number;
      currency: string;
      quantity: number;
      description?: string;
      type: string;
      commands?: string[];
      imageUrl?: string;
      allowCustomCount: boolean;
    };
  }>('/', {
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

  // PUT /products/:id — admin only
  fastify.put<{
    Params: { id: string };
    Body: {
      name?: string;
      price?: number;
      currency?: string;
      quantity?: number;
      description?: string;
      type?: string;
      commands?: string[];
      imageUrl?: string;
    };
  }>('/:id', {
    onRequest: [fastify.authenticate],
    schema: { body: productBodySchema },
  }, async (request) => {
    return service.update(request.params.id, request.body);
  });

  // DELETE /products/:id — admin only
  fastify.delete<{ Params: { id: string } }>('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    await service.delete(request.params.id);
    return reply.code(204).send();
  });

  // POST /products/:id/duplicate — admin only
  fastify.post<{ Params: { id: string } }>('/:id/duplicate', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const product = await service.duplicate(request.params.id);
    return reply.code(201).send(product);
  });
};

export default productRoutes;
