import { test, before, after, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import nock from 'nock';
import { HeleketGateway } from '../../src/gateways/heleket.gateway';
import { PaymentError } from '../../src/core/errors';

const BASE = 'https://api.heleket.com';
const MERCHANT = 'merchant-uuid';
const API_KEY = 'api-key-secret';

function expectedSign(body: Record<string, unknown>, apiKey = API_KEY): string {
  const json = JSON.stringify(body);
  const base64 = Buffer.from(json).toString('base64');
  return createHash('md5').update(base64 + apiKey).digest('hex');
}

before(() => nock.disableNetConnect());
after(() => nock.enableNetConnect());
beforeEach(() => nock.cleanAll());

test('createPayment — sends correct body, merchant and signature headers', async () => {
  const gateway = new HeleketGateway(MERCHANT, API_KEY);
  const captured: { body: any, headers: any } = { body: null, headers: null };

  nock(BASE, {
    reqheaders: {
      merchant: (value: string) => { captured.headers = { ...captured.headers, merchant: value }; return true; },
      sign: (value: string) => { captured.headers = { ...captured.headers, sign: value }; return true; },
    },
  })
    .post('/v1/payment', (body: any) => {
      captured.body = body;
      return true;
    })
    .reply(200, {
      state: 0,
      result: {
        uuid: 'heleket-uuid',
        order_id: 'order-1',
        amount: '15.00',
        currency: 'USDT',
        merchant_amount: '14.93',
        commission: '0.07',
        network: 'tron',
        address: 'TXXX',
        payment_status: 'check',
        url: 'https://pay.heleket.com/heleket-uuid',
        expired_at: 0,
        is_final: false,
        created_at: 'now',
        updated_at: 'now',
        payer_amount: '15.00',
        payer_currency: 'USDT',
      },
    });

  const result = await gateway.createPayment({
    amount: 15,
    currency: 'USDT',
    orderId: 'order-1',
    urlCallback: 'https://example.com/webhook',
    urlReturn: 'https://example.com/return',
    urlSuccess: 'https://example.com/success',
    lifetime: 3600,
  });

  assert.strictEqual(captured.body.amount, '15.00');
  assert.strictEqual(captured.body.order_id, 'order-1');
  assert.strictEqual(captured.body.url_callback, 'https://example.com/webhook');
  assert.strictEqual(captured.body.url_return, 'https://example.com/return');
  assert.strictEqual(captured.body.url_success, 'https://example.com/success');
  assert.strictEqual(captured.body.lifetime, 3600);
  assert.strictEqual(captured.headers.merchant, MERCHANT);
  assert.strictEqual(captured.headers.sign, expectedSign(captured.body));

  assert.strictEqual(result.uuid, 'heleket-uuid');
  assert.strictEqual(result.url, 'https://pay.heleket.com/heleket-uuid');
});

test('createPayment — omits optional urls when not provided', async () => {
  const gateway = new HeleketGateway(MERCHANT, API_KEY);
  let body: any = null;

  nock(BASE)
    .post('/v1/payment', (b) => { body = b; return true; })
    .reply(200, { state: 0, result: stubPayment() });

  await gateway.createPayment({
    amount: 5,
    currency: 'USDT',
    orderId: 'x',
    urlCallback: 'https://cb',
  });

  assert.strictEqual(body.url_return, undefined);
  assert.strictEqual(body.url_success, undefined);
  assert.strictEqual(body.lifetime, undefined);
});

test('createPayment — throws PaymentError when state != 0', async () => {
  const gateway = new HeleketGateway(MERCHANT, API_KEY);

  nock(BASE)
    .post('/v1/payment')
    .reply(200, { state: 1, result: null });

  await assert.rejects(
    gateway.createPayment({ amount: 1, currency: 'USDT', orderId: 'x', urlCallback: 'https://cb' }),
    (err: any) => {
      assert.ok(err instanceof PaymentError);
      assert.strictEqual(err.code, 'HELEKET_CREATE_ERROR');
      assert.match(err.message, /state 1/);
      return true;
    },
  );
});

test('createPayment — throws PaymentError on HTTP error', async () => {
  const gateway = new HeleketGateway(MERCHANT, API_KEY);

  nock(BASE)
    .post('/v1/payment')
    .reply(422, { message: 'Invalid currency' });

  await assert.rejects(
    gateway.createPayment({ amount: 1, currency: 'XXX', orderId: 'x', urlCallback: 'https://cb' }),
    (err: any) => {
      assert.ok(err instanceof PaymentError);
      assert.match(err.message, /Invalid currency/);
      return true;
    },
  );
});

test('getPayment — POSTs /v1/payment/info with uuid', async () => {
  const gateway = new HeleketGateway(MERCHANT, API_KEY);

  nock(BASE)
    .post('/v1/payment/info', (body) => {
      assert.strictEqual(body.uuid, 'lookup-uuid');
      return true;
    })
    .reply(200, { state: 0, result: stubPayment({ uuid: 'lookup-uuid' }) });

  const result = await gateway.getPayment('lookup-uuid');
  assert.strictEqual(result.uuid, 'lookup-uuid');
});

test('getPayment — throws PaymentError on error', async () => {
  const gateway = new HeleketGateway(MERCHANT, API_KEY);

  nock(BASE).post('/v1/payment/info').reply(404, { message: 'not found' });

  await assert.rejects(
    gateway.getPayment('missing'),
    (err: any) => err.code === 'HELEKET_GET_ERROR',
  );
});

test('verifyWebhookSignature — returns true for valid signature', () => {
  const gateway = new HeleketGateway(MERCHANT, API_KEY);
  const payload = {
    type: 'payment',
    uuid: 'p1',
    status: 'paid',
    // URL with forward slash — ensures our escape logic works
    callback: 'https://example.com/callback',
  };

  // Heleket PHP-style: forward slashes are escaped in JSON
  const json = JSON.stringify(payload).replace(/\//g, '\\/');
  const base64 = Buffer.from(json).toString('base64');
  const sign = createHash('md5').update(base64 + API_KEY).digest('hex');

  assert.strictEqual(gateway.verifyWebhookSignature({ ...payload, sign }), true);
});

test('verifyWebhookSignature — returns false for invalid signature', () => {
  const gateway = new HeleketGateway(MERCHANT, API_KEY);
  assert.strictEqual(
    gateway.verifyWebhookSignature({ uuid: 'x', sign: 'wrong-signature' }),
    false,
  );
});

test('verifyWebhookSignature — returns false when sign is missing', () => {
  const gateway = new HeleketGateway(MERCHANT, API_KEY);
  assert.strictEqual(gateway.verifyWebhookSignature({ uuid: 'x' }), false);
});

test('isValidWebhookIp — accepts Heleket IP range 31.133.220.x', () => {
  assert.strictEqual(HeleketGateway.isValidWebhookIp('31.133.220.8'), true);
  assert.strictEqual(HeleketGateway.isValidWebhookIp('31.133.220.1'), true);
  assert.strictEqual(HeleketGateway.isValidWebhookIp('31.133.220.255'), true);
});

test('isValidWebhookIp — rejects other IPs', () => {
  assert.strictEqual(HeleketGateway.isValidWebhookIp('1.2.3.4'), false);
  assert.strictEqual(HeleketGateway.isValidWebhookIp('31.133.221.8'), false);
  assert.strictEqual(HeleketGateway.isValidWebhookIp(''), false);
});

function stubPayment(overrides: Partial<Record<string, string | number | boolean>> = {}) {
  return {
    uuid: 'uuid',
    order_id: 'order',
    amount: '1.00',
    payer_amount: '1.00',
    payer_currency: 'USDT',
    currency: 'USDT',
    merchant_amount: '0.99',
    commission: '0.01',
    network: 'tron',
    address: 'TXXX',
    payment_status: 'check',
    url: 'https://pay.heleket.com/uuid',
    expired_at: 0,
    is_final: false,
    created_at: 'now',
    updated_at: 'now',
    ...overrides,
  };
}
