import { type FastifyPluginAsync } from 'fastify';
import { PaymentOptionService } from '@/services/payment-option.service';

const paymentOptionRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new PaymentOptionService();

  // GET /payment-options — public (shop needs this)
  fastify.get('/', async () => {
    return service.findEnabled();
  });

  // GET /payment-options/all — admin only (includes disabled)
  fastify.get('/all', {
    onRequest: [fastify.authenticate],
  }, async () => {
    return service.findAll();
  });

  // POST /payment-options — admin only
  fastify.post<{
    Body: {
      name: string;
      icon: string;
      providerId: string;
      sortOrder?: number;
      enabled?: boolean;
    };
  }>('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object' as const,
        required: ['name', 'icon', 'providerId'],
        properties: {
          name: { type: 'string' as const, minLength: 1, maxLength: 128 },
          icon: { type: 'string' as const, minLength: 1, maxLength: 128 },
          providerId: { type: 'string' as const, minLength: 1, maxLength: 32 },
          sortOrder: { type: 'integer' as const, minimum: 0 },
          enabled: { type: 'boolean' as const },
        },
      },
    },
  }, async (request, reply) => {
    const option = await service.create(request.body);
    return reply.code(201).send(option);
  });

  // PUT /payment-options/:id — admin only
  fastify.put<{
    Params: { id: string };
    Body: {
      name?: string;
      icon?: string;
      providerId?: string;
      sortOrder?: number;
      enabled?: boolean;
    };
  }>('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const, minLength: 1, maxLength: 128 },
          icon: { type: 'string' as const, minLength: 1, maxLength: 128 },
          providerId: { type: 'string' as const, minLength: 1, maxLength: 32 },
          sortOrder: { type: 'integer' as const, minimum: 0 },
          enabled: { type: 'boolean' as const },
        },
      },
    },
  }, async (request, reply) => {
    try {
      return await service.update(request.params.id, request.body);
    } catch {
      return reply.code(404).send({ error: 'Payment option not found' });
    }
  });

  // DELETE /payment-options/:id — admin only
  fastify.delete<{ Params: { id: string } }>('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      await service.delete(request.params.id);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: 'Payment option not found' });
    }
  });
};

export default paymentOptionRoutes;
