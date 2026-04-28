import { type FastifyPluginAsync } from 'fastify';
import { ShopSettingsService } from '@/services/shop-settings.service';

const shopSettingsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new ShopSettingsService();

  // GET /shop-settings — public (shop needs this)
  fastify.get('/', async () => {
    return service.get();
  });

  // PUT /shop-settings — admin only
  fastify.put<{
    Body: { name?: string; description?: string; color?: string; ip?: string; shopUrl?: string };
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
        },
      },
    },
  }, async (request) => {
    const { name, description, color, ip, shopUrl } = request.body;
    return service.update({ name, description, color, ip, shopUrl });
  });
};

export default shopSettingsRoutes;
