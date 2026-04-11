import { FastifyPluginAsync } from 'fastify';
import { PaymentService } from '@/services/payment.service';
import { YooKassaGateway } from '@/gateways/yookassa.gateway';

const webhookRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const paymentService = new PaymentService();

  /**
   * POST /webhooks/yookassa — YooKassa payment notification
   * @see https://yookassa.ru/developers/using-api/webhooks
   *
   * YooKassa sends a JSON body with { type, event, object }
   * No auth header — validated by source IP
   */
  fastify.post<{
    Body: {
      type: string;
      event: string;
      object: Record<string, any>;
    };
  }>('/yookassa', {
    config: { rateLimit: { max: 200, timeWindow: 60000 } },
    schema: {
      body: {
        type: 'object' as const,
        required: ['type', 'event', 'object'],
        properties: {
          type: { type: 'string' as const },
          event: { type: 'string' as const },
          object: { type: 'object' as const },
        },
      },
    },
  }, async (request, reply) => {
    // Validate source IP (YooKassa sends from specific IP ranges)
    // x-forwarded-for takes priority when behind a reverse proxy (Docker, nginx, etc.)
    const forwardedFor = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
    const clientIp = forwardedFor || request.ip || '';

    const skipIpCheck = process.env.NODE_ENV === 'development'
      || process.env.YOOKASSA_SKIP_IP_CHECK === 'true';

    if (!skipIpCheck && !YooKassaGateway.isValidWebhookIp(clientIp)) {
      request.log.warn(`YooKassa webhook rejected: invalid source IP ${clientIp}`);
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const { event, object } = request.body;

    request.log.info(`YooKassa webhook: ${event} for payment ${object?.id}`);

    try {
      await paymentService.handleYooKassaWebhook(event, object);
    } catch (error: any) {
      // Log but don't fail — YooKassa retries on non-200
      request.log.error(`YooKassa webhook processing error: ${error.message}`);
    }

    // Always respond 200 to acknowledge receipt
    return reply.code(200).send({ status: 'ok' });
  });
};

export default webhookRoutes;
