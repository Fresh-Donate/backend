import { FastifyPluginAsync } from 'fastify';
import { ShopSettingsService } from '@/services/shop-settings.service';

const shopSettingsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new ShopSettingsService();

  // GET /shop-settings — public (shop needs this)
  fastify.get('/', async () => {
    return service.get();
  });

  // PUT /shop-settings — admin only
  fastify.put<{
    Body: { name?: string; description?: string; color?: string };
  }>('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 64 },
          description: { type: 'string', maxLength: 500 },
          color: { type: 'string', minLength: 1, maxLength: 32 },
        },
      },
    },
  }, async (request) => {
    const { name, description, color } = request.body;
    return service.update({ name, description, color });
  });
};

export default shopSettingsRoutes;
