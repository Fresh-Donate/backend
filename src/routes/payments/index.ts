import { FastifyPluginAsync } from 'fastify';
import { PaymentService } from '@/services/payment.service';
import { DeliveryService } from '@/services/delivery.service';
import { PaymentProvider } from '@/models/payment-provider.model';
import { HeleketGateway } from '@/gateways/heleket.gateway';
import { config } from '@/config';
import type { PaymentStatus } from '@/models/payment.model';

const paymentRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new PaymentService();
  const deliveryService = new DeliveryService();

  // POST /payments — public (shop creates payment)
  fastify.post<{
    Body: {
      productId: string;
      nickname: string;
      email: string;
      paymentOptionId: string;
    };
  }>('/', {
    schema: {
      body: {
        type: 'object' as const,
        required: ['productId', 'nickname', 'email', 'paymentOptionId'],
        properties: {
          productId: { type: 'string' as const },
          nickname: { type: 'string' as const, minLength: 1, maxLength: 64 },
          email: { type: 'string' as const, format: 'email', maxLength: 256 },
          paymentOptionId: { type: 'string' as const },
        },
      },
    },
  }, async (request, reply) => {
    const payment = await service.create(request.body);
    return reply.code(201).send(payment);
  });

  // GET /payments/:id/status — public, check payment status (for return page polling)
  fastify.get<{ Params: { id: string } }>('/:id/status', async (request, reply) => {
    const payment = await service.findById(request.params.id);
    if (!payment) return reply.code(404).send({ error: 'Payment not found' });
    return {
      id: payment.id,
      status: payment.status,
      productName: payment.productName,
      totalAmount: payment.totalAmount,
      currency: payment.currency,
    };
  });

  // GET /payments — admin only, list all payments
  fastify.get<{
    Querystring: {
      status?: PaymentStatus;
      search?: string;
      limit?: string;
      offset?: string;
    };
  }>('/', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { status, search, limit, offset } = request.query;
    return service.findAll({
      status,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  });

  // GET /payments/:id — admin only
  fastify.get<{ Params: { id: string } }>('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const payment = await service.findById(request.params.id);
    if (!payment) return reply.code(404).send({ error: 'Payment not found' });
    return payment;
  });

  // POST /payments/:id/confirm — webhook / admin manual confirm
  fastify.post<{ Params: { id: string } }>('/:id/confirm', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    return service.confirmPayment(request.params.id);
  });

  // POST /payments/:id/retry-delivery — admin manual retry delivery
  fastify.post<{ Params: { id: string } }>('/:id/retry-delivery', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    await deliveryService.retryDelivery(request.params.id);
    const payment = await service.findById(request.params.id);
    if (!payment) return reply.code(404).send({ error: 'Payment not found' });
    return payment;
  });

  // POST /payments/:id/simulate-webhook — admin only, trigger test webhook from provider (test mode)
  fastify.post<{ Params: { id: string } }>('/:id/simulate-webhook', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const payment = await service.findById(request.params.id);
    if (!payment) return reply.code(404).send({ error: 'Payment not found' });
    if (payment.status !== 'pending') {
      return reply.code(400).send({ error: 'Payment is not pending' });
    }

    // Check test mode on the provider
    if (!payment.providerId) {
      return reply.code(400).send({ error: 'Payment has no provider' });
    }

    const provider = await PaymentProvider.findOne({ where: { providerId: payment.providerId } });
    if (!provider) {
      return reply.code(400).send({ error: 'Provider not found' });
    }
    if (provider.credentials.testMode !== 'true') {
      return reply.code(400).send({ error: 'Тестовый режим не включён для этого провайдера' });
    }

    if (payment.providerId === 'heleket') {
      // Use Heleket's official test-webhook API
      // First, fetch the invoice from Heleket to get correct currency & network
      const gateway = new HeleketGateway(provider.credentials.merchantId, provider.credentials.apiKey);
      const callbackUrl = `${config.payment.webhookBaseUrl}/webhooks/heleket`;

      let invoiceCurrency = payment.currency;
      let invoiceNetwork = 'tron';

      if (payment.externalPaymentId) {
        try {
          const invoiceInfo = await gateway.getPayment(payment.externalPaymentId);
          invoiceCurrency = invoiceInfo.currency || invoiceCurrency;
          invoiceNetwork = invoiceInfo.network || invoiceNetwork;
        } catch {
          // If we can't fetch info, use defaults — test-webhook may still work
          request.log.warn('Could not fetch Heleket invoice info, using defaults');
        }
      }

      await gateway.sendTestWebhook({
        urlCallback: callbackUrl,
        currency: invoiceCurrency,
        network: invoiceNetwork,
        uuid: payment.externalPaymentId || undefined,
        orderId: payment.id,
        status: 'paid',
      });

      // Heleket sends the webhook asynchronously, wait a bit and return current state
      // The actual status update happens via the webhook handler
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else if (payment.providerId === 'yookassa') {
      // YooKassa doesn't have a test-webhook API, simulate locally
      await service.handleYooKassaWebhook('payment.succeeded', {
        id: payment.externalPaymentId,
        status: 'succeeded',
        amount: { value: String(payment.totalAmount), currency: payment.currency },
        income_amount: { value: String(payment.providerAmount), currency: payment.currency },
        paid: true,
        captured_at: new Date().toISOString(),
        metadata: { payment_id: payment.id },
      });
    } else {
      await service.confirmPayment(payment.id);
    }

    const updated = await service.findById(request.params.id);
    return updated;
  });
};

export default paymentRoutes;
