import { type FastifyPluginAsync } from 'fastify';
import { ShopSettingsService } from '@/services/shop-settings.service';
import type { OwnerType } from '@/models/shop-settings.model';

const shopSettingsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new ShopSettingsService();

  // GET /shop-settings — public (shop needs this)
  fastify.get('/', async () => {
    return service.get();
  });

  // PUT /shop-settings — admin only
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
          // Validated as URI; trailing slashes are stripped by the service.
          shopUrl: { type: 'string', format: 'uri', maxLength: 256 },
          // Owner identity for the public legal pages. All optional;
          // empty string means "не указано". Stale enum values are
          // re-mapped to '' in the service so the frontend can't render
          // garbage labels.
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
