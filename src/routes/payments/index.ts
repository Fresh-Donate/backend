import { FastifyPluginAsync } from 'fastify';
import { PaymentService } from '@/services/payment.service';
import { DeliveryService } from '@/services/delivery.service';
import { PaymentProvider } from '@/models/payment-provider.model';
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

  // POST /payments/:id/simulate-webhook — admin only, simulate provider webhook (test mode)
  fastify.post<{ Params: { id: string } }>('/:id/simulate-webhook', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const payment = await service.findById(request.params.id);
    if (!payment) return reply.code(404).send({ error: 'Payment not found' });
    if (payment.status !== 'pending') {
      return reply.code(400).send({ error: 'Payment is not pending' });
    }

    // Check test mode on the provider
    if (payment.providerId) {
      const provider = await PaymentProvider.findOne({ where: { providerId: payment.providerId } });
      if (provider && provider.credentials.testMode !== 'true') {
        return reply.code(400).send({ error: 'Test mode is not enabled for this provider' });
      }
    }

    // Simulate successful payment
    if (payment.providerId === 'heleket') {
      await service.handleHeleketWebhook({
        type: 'payment',
        uuid: payment.externalPaymentId || 'simulated',
        order_id: payment.id,
        amount: String(payment.totalAmount),
        payment_amount: String(payment.totalAmount),
        payment_amount_usd: '0',
        merchant_amount: String(payment.providerAmount),
        commission: String(payment.commissionAmount),
        is_final: true,
        status: 'paid',
        from: 'simulated-test-address',
        network: 'test',
        currency: payment.currency,
        payer_currency: payment.currency,
        additional_data: null,
        txid: `test-${Date.now()}`,
        sign: 'simulated',
      });
    } else if (payment.providerId === 'yookassa') {
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
      // Generic: just confirm
      await service.confirmPayment(payment.id);
    }

    const updated = await service.findById(request.params.id);
    return updated;
  });
};

export default paymentRoutes;
