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
    Body: {
      name?: string;
      description?: string;
      color?: string;
      ip?: string;
      shopUrl?: string;
      currencyRates?: Record<string, number>;
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
          // Map of "currency code → how many RUB in 1 unit". Codes and rates
          // are sanity-checked in the service (rejects RUB as a key, drops
          // non-positive or non-numeric values).
          currencyRates: {
            type: 'object',
            additionalProperties: { type: 'number', minimum: 0, maximum: 100000 },
          },
        },
      },
    },
  }, async (request) => {
    const { name, description, color, ip, shopUrl, currencyRates } = request.body;
    return service.update({ name, description, color, ip, shopUrl, currencyRates });
  });
};

export default shopSettingsRoutes;
