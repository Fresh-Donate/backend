import { type FastifyPluginAsync } from 'fastify';
import { PaymentService } from '@/services/payment.service';
import { YooKassaGateway } from '@/gateways/yookassa.gateway';
import { HeleketGateway } from '@/gateways/heleket.gateway';
import { WataGateway } from '@/gateways/wata.gateway';
import { TebexGateway } from '@/gateways/tebex.gateway';
import { PaymentProvider } from '@/models/payment-provider.model';

const webhookRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const paymentService = new PaymentService();

  // Replace the JSON parser inside this scope so we can keep the raw bytes
  // on `request.rawBody`. Wata signs the raw body; re-serialising would
  // produce a different signature. Encapsulated, so other plugins are
  // untouched.
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

  // YooKassa: no signing — validated by source IP. x-forwarded-for takes
  // priority when behind a reverse proxy (Docker, nginx).
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
      // Log but don't fail — YooKassa retries on non-200, and we'd rather
      // ack a flawed payload than receive duplicates.
      request.log.error(`YooKassa webhook processing error: ${error.message}`);
    }

    return reply.code(200).send({ status: 'ok' });
  });

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

    const forwardedFor = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
    const clientIp = forwardedFor || request.ip || '';

    const skipIpCheck = process.env.NODE_ENV === 'development'
      || process.env.HELEKET_SKIP_IP_CHECK === 'true';

    if (!skipIpCheck && !HeleketGateway.isValidWebhookIp(clientIp)) {
      request.log.warn(`Heleket webhook rejected: invalid source IP ${clientIp}`);
      return reply.code(403).send({ error: 'Forbidden' });
    }

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

  // Wata signs the raw request body with RSA-SHA512 (X-Signature header,
  // base64). Public key is fetched from the same env (prod or sandbox) the
  // payment link was created in, picked via provider.testMode.
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

  // Tebex: HMAC-SHA256 over hex(SHA256(rawBody)) keyed by webhookSecret,
  // delivered in X-Signature. When admin first registers the endpoint in
  // the Tebex panel, Tebex sends a `validation.webhook` event and expects
  // us to echo back its `id` in the JSON response body — otherwise the
  // endpoint stays in "Cannot be validated" state. Real payment events
  // accept any 2xx ack.
  fastify.post<{ Body: Record<string, any> }>('/tebex', {
    config: { rateLimit: { max: 200, timeWindow: 60000 } },
  }, async (request, reply) => {
    const provider = await PaymentProvider.findOne({ where: { providerId: 'tebex' } });
    if (!provider) {
      request.log.error('Tebex webhook: provider not found in database');
      return reply.code(200).send({ status: 'ok' });
    }

    const webhookSecret = provider.credentials.webhookSecret;
    const rawBody: Buffer | undefined = (request as any).rawBody;
    const signature = request.headers['x-signature'] as string | undefined;

    const skipSig = process.env.NODE_ENV === 'development'
      || process.env.TEBEX_SKIP_SIGNATURE_CHECK === 'true';

    if (!skipSig) {
      if (!webhookSecret) {
        request.log.warn('Tebex webhook rejected: webhookSecret not configured');
        return reply.code(403).send({ error: 'Not configured' });
      }
      if (!rawBody) {
        request.log.warn('Tebex webhook rejected: raw body unavailable');
        return reply.code(400).send({ error: 'Bad request' });
      }
      const ok = TebexGateway.verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!ok) {
        request.log.warn('Tebex webhook rejected: invalid signature');
        return reply.code(403).send({ error: 'Invalid signature' });
      }
    }

    const payload = (request.body || {}) as any;
    request.log.info(
      `Tebex webhook: type=${payload.type} id=${payload.id} tx=${payload.subject?.transaction_id}`,
    );

    // Validation handshake — must echo back the envelope id, nothing else.
    if (payload.type === 'validation.webhook') {
      return reply.code(200).send({ id: payload.id });
    }

    try {
      await paymentService.handleTebexWebhook(payload);
    } catch (error: any) {
      request.log.error(`Tebex webhook processing error: ${error.message}`);
    }

    return reply.code(200).send({ id: payload.id });
  });
};

export default webhookRoutes;
