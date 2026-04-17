import { test, before, after, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import nock from 'nock';
import { YooKassaGateway } from '../../src/gateways/yookassa.gateway';
import { PaymentError } from '../../src/core/errors';

const BASE = 'https://api.yookassa.ru';
const SHOP_ID = 'test-shop';
const SECRET = 'test-secret';

before(() => nock.disableNetConnect());
after(() => nock.enableNetConnect());
beforeEach(() => nock.cleanAll());

test('createPayment — returns response on success', async () => {
  const gateway = new YooKassaGateway(SHOP_ID, SECRET);

  const response = {
    id: 'pay_123',
    status: 'pending',
    amount: { value: '100.00', currency: 'RUB' },
    paid: false,
    refundable: false,
    created_at: '2026-01-01T00:00:00Z',
    confirmation: { type: 'redirect', confirmation_url: 'https://yookassa.ru/checkout/pay_123' },
  };

  nock(BASE)
    .post('/v3/payments', (body) => {
      assert.strictEqual(body.amount.value, '100.00');
      assert.strictEqual(body.amount.currency, 'RUB');
      assert.strictEqual(body.description, 'Test purchase');
      assert.strictEqual(body.confirmation.type, 'redirect');
      return true;
    })
    .matchHeader('Idempotence-Key', /.+/)
    .reply(200, response);

  const result = await gateway.createPayment({
    amount: 100,
    currency: 'RUB',
    description: 'Test purchase',
    returnUrl: 'https://example.com/return',
  });

  assert.strictEqual(result.id, 'pay_123');
  assert.strictEqual(result.confirmation?.confirmation_url, 'https://yookassa.ru/checkout/pay_123');
});

test('createPayment — includes payment_method_data when type provided', async () => {
  const gateway = new YooKassaGateway(SHOP_ID, SECRET);
  let receivedBody: any = null;

  nock(BASE)
    .post('/v3/payments', (body) => {
      receivedBody = body;
      return true;
    })
    .reply(200, {
      id: 'pay_x',
      status: 'pending',
      amount: { value: '50.00', currency: 'RUB' },
      paid: false,
      refundable: false,
      created_at: 'now',
    });

  await gateway.createPayment({
    amount: 50,
    currency: 'RUB',
    description: 'SBP test',
    returnUrl: 'https://example.com',
    paymentMethodType: 'sbp',
  });

  assert.deepStrictEqual(receivedBody.payment_method_data, { type: 'sbp' });
});

test('createPayment — formats amount with 2 decimals', async () => {
  const gateway = new YooKassaGateway(SHOP_ID, SECRET);
  let receivedBody: any = null;

  nock(BASE)
    .post('/v3/payments', (body) => { receivedBody = body; return true; })
    .reply(200, {
      id: 'p', status: 'pending', amount: { value: '7.00', currency: 'RUB' },
      paid: false, refundable: false, created_at: 'now',
    });

  await gateway.createPayment({
    amount: 7,
    currency: 'RUB',
    description: 'x',
    returnUrl: 'https://example.com',
  });

  assert.strictEqual(receivedBody.amount.value, '7.00');
});

test('createPayment — throws PaymentError on API failure', async () => {
  const gateway = new YooKassaGateway(SHOP_ID, SECRET);

  nock(BASE)
    .post('/v3/payments')
    .reply(400, { type: 'error', description: 'Invalid amount' });

  await assert.rejects(
    gateway.createPayment({
      amount: 1,
      currency: 'RUB',
      description: 'x',
      returnUrl: 'https://example.com',
    }),
    (err: any) => {
      assert.ok(err instanceof PaymentError);
      assert.strictEqual(err.code, 'YOOKASSA_CREATE_ERROR');
      assert.match(err.message, /Invalid amount/);
      return true;
    },
  );
});

test('getPayment — fetches payment by id', async () => {
  const gateway = new YooKassaGateway(SHOP_ID, SECRET);

  nock(BASE)
    .get('/v3/payments/abc123')
    .reply(200, {
      id: 'abc123',
      status: 'succeeded',
      amount: { value: '500.00', currency: 'RUB' },
      paid: true,
      refundable: true,
      created_at: 'now',
    });

  const result = await gateway.getPayment('abc123');
  assert.strictEqual(result.id, 'abc123');
  assert.strictEqual(result.status, 'succeeded');
  assert.strictEqual(result.paid, true);
});

test('getPayment — throws PaymentError on 404', async () => {
  const gateway = new YooKassaGateway(SHOP_ID, SECRET);

  nock(BASE)
    .get('/v3/payments/missing')
    .reply(404, { type: 'error', description: 'Not found' });

  await assert.rejects(
    gateway.getPayment('missing'),
    (err: any) => err.code === 'YOOKASSA_GET_ERROR',
  );
});

test('capturePayment — sends capture with amount', async () => {
  const gateway = new YooKassaGateway(SHOP_ID, SECRET);
  let body: any = null;

  nock(BASE)
    .post('/v3/payments/pay_1/capture', (b) => { body = b; return true; })
    .reply(200, {
      id: 'pay_1', status: 'succeeded', paid: true, refundable: true,
      amount: { value: '100.00', currency: 'RUB' }, created_at: 'now',
    });

  await gateway.capturePayment('pay_1', 100, 'RUB');
  assert.strictEqual(body.amount.value, '100.00');
  assert.strictEqual(body.amount.currency, 'RUB');
});

test('createRefund — sends payment_id and amount', async () => {
  const gateway = new YooKassaGateway(SHOP_ID, SECRET);
  let body: any = null;

  nock(BASE)
    .post('/v3/refunds', (b) => { body = b; return true; })
    .reply(200, {
      id: 'refund_1', status: 'succeeded', payment_id: 'pay_1',
      amount: { value: '50.00', currency: 'RUB' }, created_at: 'now',
    });

  const result = await gateway.createRefund('pay_1', 50, 'RUB');
  assert.strictEqual(body.payment_id, 'pay_1');
  assert.strictEqual(body.amount.value, '50.00');
  assert.strictEqual(result.id, 'refund_1');
});

test('isValidWebhookIp — accepts YooKassa IPv4 ranges', () => {
  assert.strictEqual(YooKassaGateway.isValidWebhookIp('185.71.76.1'), true);
  assert.strictEqual(YooKassaGateway.isValidWebhookIp('185.71.77.255'), true);
  assert.strictEqual(YooKassaGateway.isValidWebhookIp('77.75.153.100'), true);
  assert.strictEqual(YooKassaGateway.isValidWebhookIp('77.75.156.50'), true);
  assert.strictEqual(YooKassaGateway.isValidWebhookIp('77.75.157.1'), true);
});

test('isValidWebhookIp — accepts YooKassa IPv6 prefix', () => {
  assert.strictEqual(YooKassaGateway.isValidWebhookIp('2a02:5180:0000:1234::1'), true);
});

test('isValidWebhookIp — rejects unknown IP', () => {
  assert.strictEqual(YooKassaGateway.isValidWebhookIp('1.2.3.4'), false);
  assert.strictEqual(YooKassaGateway.isValidWebhookIp('10.0.0.1'), false);
  assert.strictEqual(YooKassaGateway.isValidWebhookIp(''), false);
});
