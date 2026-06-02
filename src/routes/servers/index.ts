import { type FastifyPluginAsync } from 'fastify';
import { ServerService } from '@/services/server.service';
import { AppError } from '@/core';
import type { CreateServerDto, UpdateServerDto } from '@/types';

const serverBodySchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, minLength: 4, maxLength: 64 },
    name: { type: 'string' as const, minLength: 1, maxLength: 128 },
    ip: { type: 'string' as const, maxLength: 256 },
  },
};

const updateBodySchema = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' as const, minLength: 1, maxLength: 128 },
    ip: { type: 'string' as const, maxLength: 256 },
  },
};

const serverRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new ServerService();

  fastify.get('/', { onRequest: [fastify.authenticate] }, async () => {
    return service.findAll();
  });

  fastify.get<{ Params: { id: string } }>('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    return service.findById(request.params.id);
  });

  fastify.post<{ Body: CreateServerDto }>('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        ...serverBodySchema,
        required: ['name'],
      },
    },
  }, async (request, reply) => {
    try {
      const server = await service.create(request.body);
      return reply.code(201).send(server);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.put<{
    Params: { id: string };
    Body: UpdateServerDto;
  }>('/:id', {
    onRequest: [fastify.authenticate],
    schema: { body: updateBodySchema },
  }, async (request, reply) => {
    try {
      return await service.update(request.params.id, request.body);
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      await service.delete(request.params.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });
};

export default serverRoutes;
