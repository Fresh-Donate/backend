import { type FastifyPluginAsync, type FastifyRequest, type FastifyReply } from 'fastify';
import { SettingsService } from '@/services/settings.service';
import { ServerService } from '@/services/server.service';
import { DeliveryService } from '@/services/delivery.service';
import { isUuid } from '@/utils/uuid';

const settingsService = new SettingsService();
const serverService = new ServerService();
const deliveryService = new DeliveryService();

// Auth flow:
//   1. X-Api-Key is ALWAYS the global settings.plugin_config.token. It
//      authenticates the plugin regardless of mode - like before.
//   2. multi_server_enabled=true: X-Server-Id additionally tells the backend
//      which server this plugin represents. Used for routing PaymentDelivery
//      rows. The id alone is NOT a credential; without a valid api key it
//      grants nothing.
//   3. multi_server_enabled=false (legacy): X-Server-Id is ignored.
async function authenticatePlugin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = request.headers['x-api-key'];
  if (typeof apiKey !== 'string' || !apiKey) {
    return reply.code(401).send({ error: 'Missing X-Api-Key header' });
  }

  const settings = await settingsService.get();

  if (!settings.plugin_config.token || apiKey !== settings.plugin_config.token) {
    return reply.code(403).send({ error: 'Invalid API key' });
  }

  if (settings.multi_server_enabled) {
    const serverIdHeader = request.headers['x-server-id'];
    if (typeof serverIdHeader !== 'string' || !serverIdHeader) {
      return reply.code(400).send({ error: 'Missing X-Server-Id header (multi-server mode is on)' });
    }
    const server = await serverService.findByAuthKey(serverIdHeader);
    if (!server) {
      return reply.code(403).send({ error: 'Unknown server id' });
    }
    (request as any).pluginServerId = server.id;
  }
}

function pluginServerId(request: FastifyRequest): string | null {
  return ((request as any).pluginServerId as string | undefined) ?? null;
}

const pluginRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {

  fastify.get('/ping', {
    preHandler: authenticatePlugin,
  }, async (request) => {
    return { status: 'ok', serverId: pluginServerId(request) };
  });

  fastify.get('/deliveries/pending', {
    preHandler: authenticatePlugin,
  }, async (request) => {
    return deliveryService.pendingForPlugin(pluginServerId(request), null);
  });

  fastify.post<{ Body: { online?: string[] } | undefined }>('/deliveries/pending', {
    preHandler: authenticatePlugin,
    schema: {
      body: {
        type: 'object' as const,
        properties: {
          online: {
            type: 'array' as const,
            maxItems: 10000,
            items: { type: 'string' as const, maxLength: 64 },
          },
        },
      },
    },
  }, async (request) => {
    return deliveryService.pendingForPlugin(pluginServerId(request), request.body?.online ?? []);
  });

  fastify.post<{
    Params: { paymentId: string };
    Body: {
      success: boolean;
      logs: Array<{ command: string; success: boolean; response: string }>;
    };
  }>('/deliveries/:paymentId/result', {
    preHandler: authenticatePlugin,
    schema: {
      body: {
        type: 'object' as const,
        required: ['success', 'logs'],
        properties: {
          success: { type: 'boolean' as const },
          logs: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                command: { type: 'string' as const },
                success: { type: 'boolean' as const },
                response: { type: 'string' as const },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { paymentId } = request.params;
    if (!isUuid(paymentId)) {
      return reply.code(404).send({ error: 'Payment not found' });
    }

    const logs = request.body.logs.map((l) => ({
      command: String(l.command ?? ''),
      success: l.success === true,
      response: String(l.response ?? ''),
    }));
    const result = await deliveryService.reportFromPlugin(paymentId, pluginServerId(request), request.body.success, logs);
    if (!result) {
      return reply.code(404).send({ error: 'No pending delivery for this payment' });
    }
    return { status: 'ok', ...result };
  });
};

export default pluginRoutes;
