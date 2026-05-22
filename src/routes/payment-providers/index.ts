import { type FastifyPluginAsync } from 'fastify';
import { PaymentProviderService } from '@/services/payment-provider.service';
import type { UpdatePaymentProviderDto } from '@/types';

const paymentProviderRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new PaymentProviderService();

  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async () => {
    return service.findAll();
  });

  fastify.get<{ Params: { providerId: string } }>('/:providerId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const result = await service.findByProviderId(request.params.providerId);
    if (!result) {
      return reply.code(404).send({ error: 'Provider not found' });
    }
    return result;
  });

  fastify.put<{
    Params: { providerId: string };
    Body: UpdatePaymentProviderDto;
  }>('/:providerId', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object' as const,
        properties: {
          enabled: { type: 'boolean' as const },
          testMode: { type: 'boolean' as const },
          credentials: { type: 'object' as const },
          providerConfig: { type: 'object' as const },
          commissionPercent: { type: 'number' as const, minimum: 0, maximum: 100 },
          commissionRule: { type: 'object' as const },
          supportedCurrencies: {
            type: 'array' as const,
            items: { type: 'string' as const },
          },
        },
      },
    },
  }, async (request) => {
    return service.update(request.params.providerId, request.body);
  });
};

export default paymentProviderRoutes;
