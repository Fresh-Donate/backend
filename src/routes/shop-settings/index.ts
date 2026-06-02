import { type FastifyPluginAsync } from 'fastify';
import { ShopSettingsService } from '@/services/shop-settings.service';
import type { OwnerType } from '@/models/shop-settings.model';

const shopSettingsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new ShopSettingsService();

  fastify.get('/', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return service.get();
  });

  fastify.put<{
    Body: {
      name?: string;
      description?: string;
      color?: string;
      ip?: string;
      shopUrl?: string;
      ownerName?: string;
      ownerType?: OwnerType;
      ownerInn?: string;
      contactEmail?: string;
    };
  }>('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 64 },
          description: { type: 'string', maxLength: 500 },
          color: { type: 'string', minLength: 1, maxLength: 32 },
          ip: { type: 'string', minLength: 1, maxLength: 64 },
          shopUrl: { type: 'string', format: 'uri', maxLength: 256 },
          ownerName: { type: 'string', maxLength: 256 },
          ownerType: { type: 'string', enum: ['', 'individual', 'self_employed', 'sole_proprietor', 'legal_entity'] },
          ownerInn: { type: 'string', maxLength: 32 },
          contactEmail: { type: 'string', maxLength: 256 },
        },
      },
    },
  }, async (request) => {
    return service.update(request.body);
  });
};

export default shopSettingsRoutes;
