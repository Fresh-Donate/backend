import { test, before, after, beforeEach, type TestContext } from 'node:test';
import * as assert from 'node:assert';
import nock from 'nock';
import { PaymentService } from '../../src/services/payment.service';
import { Payment } from '../../src/models/payment.model';
import { PaymentProvider } from '../../src/models/payment-provider.model';
import { PaymentError } from '../../src/core/errors';

const BASE = 'https://api.yookassa.ru';

before(() => nock.disableNetConnect());
after(() => nock.enableNetConnect());
beforeEach(() => nock.cleanAll());

function stubDb(t: TestContext, status: string) {
  const updates: Record<string, unknown>[] = [];
  const payment = {
    id: 'payment-1',
    status,
    totalAmount: 100,
    currency: 'RUB',
    meta: {},
    update: async (data: Record<string, unknown>) => {
      updates.push(data);
    },
  };
  t.mock.method(Payment, 'findOne', async () => payment);
  t.mock.method(PaymentProvider, 'findOne', async () => ({
    credentials: { shopId: 'shop', secretKey: 'secret' },
  }));
  return updates;
}

test('handleYooKassaWebhook — ignores a forged "succeeded" notification when the API says pending', async (t) => {
  const updates = stubDb(t, 'pending');
  nock(BASE).get('/v3/payments/ext-1').reply(200, {
    id: 'ext-1',
    status: 'pending',
    amount: { value: '100.00', currency: 'RUB' },
    paid: false,
    refundable: false,
    created_at: 'now',
  });

  await new PaymentService().handleYooKassaWebhook('ext-1');

  assert.deepStrictEqual(updates, []);
  assert.ok(nock.isDone());
});

test('handleYooKassaWebhook — marks the payment failed when the API says canceled', async (t) => {
  const updates = stubDb(t, 'pending');
  nock(BASE).get('/v3/payments/ext-2').reply(200, {
    id: 'ext-2',
    status: 'canceled',
    amount: { value: '100.00', currency: 'RUB' },
    paid: false,
    refundable: false,
    created_at: 'now',
    cancellation_details: { party: 'yoo_money', reason: 'expired_on_confirmation' },
  });

  await new PaymentService().handleYooKassaWebhook('ext-2');

  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0]!.status, 'failed');
});

test('handleYooKassaWebhook — throws PaymentError when the API is unavailable, so the route asks for a retry', async (t) => {
  const updates = stubDb(t, 'pending');
  nock(BASE).get('/v3/payments/ext-3').reply(500, { type: 'error', description: 'Internal error' });

  await assert.rejects(
    () => new PaymentService().handleYooKassaWebhook('ext-3'),
    (err) => err instanceof PaymentError,
  );
  assert.deepStrictEqual(updates, []);
});

test('handleYooKassaWebhook — does not call the API for a payment that is already settled', async (t) => {
  const updates = stubDb(t, 'delivered');

  await new PaymentService().handleYooKassaWebhook('ext-4');

  assert.deepStrictEqual(updates, []);
});
