import { type FastifyPluginAsync } from 'fastify';
import { SettingsService, type SettingsDto } from '@/services/settings.service';

const settingsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new SettingsService();

  // GET /settings — admin only
  fastify.get('/', { onRequest: [fastify.authenticate] }, async () => {
    return service.get();
  });

  // PUT /settings — admin only
  fastify.put<{
    Body: {
      demo_payments?: boolean;
      delivery_method?: string;
      rcon_config?: { host?: string; port?: number; password?: string };
      plugin_config?: { token?: string };
    };
  }>('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object' as const,
        properties: {
          demo_payments: { type: 'boolean' as const },
          delivery_method: { type: 'string' as const, enum: ['rcon', 'plugin'] },
          rcon_config: {
            type: 'object' as const,
            properties: {
              host: { type: 'string' as const, maxLength: 256 },
              port: { type: 'integer' as const, minimum: 1, maximum: 65535 },
              password: { type: 'string' as const, maxLength: 256 },
            },
          },
          plugin_config: {
            type: 'object' as const,
            properties: {
              token: { type: 'string' as const, maxLength: 64 },
            },
          },
        },
      },
    },
  }, async (request) => {
    return service.update(request.body as Partial<SettingsDto>);
  });
};

export default settingsRoutes;
