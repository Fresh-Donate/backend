import { type FastifyPluginAsync } from 'fastify';
import { GroupService } from '@/services/group.service';

const groupBodySchema = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' as const, minLength: 1, maxLength: 128 },
    upgradeMode: { type: 'boolean' as const },
    productIds: { type: 'array' as const, items: { type: 'string' as const } },
  },
};

const groupRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new GroupService();

  fastify.get('/', { onRequest: [fastify.authenticate] }, async () => {
    return service.findAll();
  });

  fastify.get<{ Params: { id: string } }>('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    return service.findById(request.params.id);
  });

  fastify.post<{
    Body: {
      name: string;
      upgradeMode?: boolean;
      productIds?: string[];
    };
  }>('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        ...groupBodySchema,
        required: ['name'],
      },
    },
  }, async (request, reply) => {
    const group = await service.create({
      name: request.body.name,
      upgradeMode: request.body.upgradeMode,
      productIds: request.body.productIds || [],
    });
    return reply.code(201).send(group);
  });

  fastify.put<{
    Params: { id: string };
    Body: {
      name?: string;
      upgradeMode?: boolean;
      productIds?: string[];
    };
  }>('/:id', {
    onRequest: [fastify.authenticate],
    schema: { body: groupBodySchema },
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

export default groupRoutes;
