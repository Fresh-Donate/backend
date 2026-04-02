import { FastifyPluginAsync } from 'fastify';
import {SettingsService} from "../../services/settings.service";

const settingsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new SettingsService();

  // GET /settings — admin only
  fastify.get('/', { onRequest: [fastify.authenticate] }, async () => {
    return service.get();
  });

  // PUT /settings — admin only
  fastify.put<{
    Body: { demo_payments?: boolean };
  }>('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          demo_payments: { type: 'boolean' }
        },
      },
    },
  }, async (request) => {
    const { demo_payments } = request.body;
    return service.update({ demo_payments });
  });
};

export default settingsRoutes;
