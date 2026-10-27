import { type FastifyPluginAsync } from 'fastify';
import { ShopSettingsService } from '@/services/shop-settings.service';
import type { ShopSettingsUpdateDto } from '@/types';

const shopSettingsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new ShopSettingsService();

  fastify.get('/', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return service.get();
  });

  fastify.get('/schema', {
    onRequest: [fastify.authenticate],
  }, async () => {
    return { schema: await service.getSchema() };
  });

  fastify.put<{ Body: ShopSettingsUpdateDto }>('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          shopUrl: { type: 'string', maxLength: 256, anyOf: [{ const: '' }, { format: 'uri' }] },
          fields: { type: 'object' },
          schema: { type: 'object' },
          name: { type: 'string', minLength: 1, maxLength: 64 },
          description: { type: 'string', maxLength: 500 },
          color: { type: 'string', minLength: 1, maxLength: 32 },
          ip: { type: 'string', minLength: 1, maxLength: 64 },
          ownerName: { type: 'string', maxLength: 256 },
          ownerType: { type: 'string', enum: ['', 'individual', 'self_employed', 'sole_proprietor', 'legal_entity'] },
          ownerInn: { type: 'string', maxLength: 32 },
          contactEmail: { type: 'string', maxLength: 256 },
          cartEnabled: { type: 'boolean' },
        },
      },
    },
  }, async (request) => {
    return service.update(request.body);
  });
};

export default shopSettingsRoutes;
