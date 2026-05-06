import { type FastifyPluginAsync } from 'fastify';
import { PaymentOptionService } from '@/services/payment-option.service';
import type { CreatePaymentOptionDto, UpdatePaymentOptionDto } from '@/types';

const paymentOptionRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new PaymentOptionService();

  fastify.get('/', async () => {
    return service.findEnabled();
  });

  fastify.get('/all', {
    onRequest: [fastify.authenticate],
  }, async () => {
    return service.findAll();
  });

  fastify.post<{ Body: CreatePaymentOptionDto }>('/', {
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

  fastify.put<{
    Params: { id: string };
    Body: UpdatePaymentOptionDto;
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
