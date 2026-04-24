import { type FastifyPluginAsync } from 'fastify';
import { PaymentService } from '@/services/payment.service';
import { YooKassaGateway } from '@/gateways/yookassa.gateway';
import { HeleketGateway } from '@/gateways/heleket.gateway';
import { WataGateway } from '@/gateways/wata.gateway';
import { PaymentProvider } from '@/models/payment-provider.model';

const webhookRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const paymentService = new PaymentService();

  // Inside this plugin scope, replace the default JSON body parser with one
  // that ALSO preserves the raw bytes on `request.rawBody`. This is only
  // needed for gateways (like Wata) that sign the raw request body, and
  // the encapsulated scope means we don't touch other plugins' parsing.
  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      const buf = body as Buffer;
      (req as any).rawBody = buf;
      if (buf.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(buf.toString('utf8')));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

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

  /**
   * POST /webhooks/heleket — Heleket crypto payment notification
   * @see https://docs.heleket.com
   *
   * Heleket sends a flat JSON with { type, uuid, order_id, status, sign, ... }
   * Validated by signature + source IP
   */
  fastify.post<{
    Body: Record<string, any>;
  }>('/heleket', {
    config: { rateLimit: { max: 200, timeWindow: 60000 } },
  }, async (request, reply) => {
    const provider = await PaymentProvider.findOne({ where: { providerId: 'heleket' } });
    if (!provider) {
      request.log.error('Heleket webhook: provider not found in database');
      return reply.code(200).send({ status: 'ok' });
    }

    const { apiKey, merchantId } = provider.credentials;

    // IP validation
    const forwardedFor = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
    const clientIp = forwardedFor || request.ip || '';

    const skipIpCheck = process.env.NODE_ENV === 'development'
      || process.env.HELEKET_SKIP_IP_CHECK === 'true';

    if (!skipIpCheck && !HeleketGateway.isValidWebhookIp(clientIp)) {
      request.log.warn(`Heleket webhook rejected: invalid source IP ${clientIp}`);
      return reply.code(403).send({ error: 'Forbidden' });
    }

    // Signature verification
    if (apiKey) {
      const gateway = new HeleketGateway(merchantId, apiKey);
      if (!gateway.verifyWebhookSignature(request.body)) {
        request.log.warn('Heleket webhook rejected: invalid signature');
        return reply.code(403).send({ error: 'Invalid signature' });
      }
    }

    const payload = request.body;
    request.log.info(`Heleket webhook: status=${payload.status} uuid=${payload.uuid} order=${payload.order_id}`);

    try {
      await paymentService.handleHeleketWebhook(payload);
    } catch (error: any) {
      request.log.error(`Heleket webhook processing error: ${error.message}`);
    }

    return reply.code(200).send({ status: 'ok' });
  });

  /**
   * POST /webhooks/wata — Wata payment notification
   * @see https://wata.pro/api
   *
   * Wata signs the raw request body with RSA-SHA512 and ships the base64
   * signature in the `X-Signature` header. The public key is fetched from
   * the same environment (prod or sandbox) that created the payment link,
   * selected by the provider's `testMode` flag.
   */
  fastify.post<{ Body: Record<string, any> }>('/wata', {
    config: { rateLimit: { max: 200, timeWindow: 60000 } },
  }, async (request, reply) => {
    const provider = await PaymentProvider.findOne({ where: { providerId: 'wata' } });
    if (!provider) {
      request.log.error('Wata webhook: provider not found in database');
      return reply.code(200).send({ status: 'ok' });
    }

    const { apiKey } = provider.credentials;
    const rawBody: Buffer | undefined = (request as any).rawBody;
    const signature = request.headers['x-signature'] as string | undefined;

    const skipSig = process.env.NODE_ENV === 'development'
      || process.env.WATA_SKIP_SIGNATURE_CHECK === 'true';

    if (!skipSig) {
      if (!apiKey) {
        request.log.warn('Wata webhook rejected: apiKey not configured, cannot verify signature');
        return reply.code(403).send({ error: 'Not configured' });
      }
      if (!rawBody) {
        request.log.warn('Wata webhook rejected: raw body unavailable');
        return reply.code(400).send({ error: 'Bad request' });
      }
      const gateway = new WataGateway(apiKey, provider.testMode);
      const ok = await gateway.verifyWebhookSignature(rawBody, signature);
      if (!ok) {
        request.log.warn('Wata webhook rejected: invalid signature');
        return reply.code(403).send({ error: 'Invalid signature' });
      }
    }

    const payload = request.body || {};
    request.log.info(
      `Wata webhook: status=${payload.transactionStatus || payload.status} tx=${payload.transactionId} order=${payload.orderId}`,
    );

    try {
      await paymentService.handleWataWebhook(payload);
    } catch (error: any) {
      request.log.error(`Wata webhook processing error: ${error.message}`);
    }

    return reply.code(200).send({ status: 'ok' });
  });
};

export default webhookRoutes;
