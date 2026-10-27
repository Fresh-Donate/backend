import { test, before, after, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { createHmac } from 'node:crypto';
import nock from 'nock';
import { RollyPayGateway } from '../../src/gateways/rollypay.gateway';
import { PaymentError } from '../../src/core/errors';

const API = 'https://rollypay.io';
const API_KEY = 'rpk_live_test';
const SECRET = 'signing-secret';

function sign(timestamp: string, body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

before(() => nock.disableNetConnect());
after(() => nock.enableNetConnect());
beforeEach(() => nock.cleanAll());

test('createPayment — sends api key, a fresh nonce per request and a decimal-string amount', async () => {
  const gateway = new RollyPayGateway(API_KEY);
  const nonces: string[] = [];
  let captured: any = null;

  nock(API, {
    reqheaders: {
      'x-api-key': API_KEY,
      'x-nonce': (v: string) => { nonces.push(v); return true; },
    },
  })
    .post('/api/v1/payments', (body: any) => { captured = body; return true; })
    .twice()
    .reply(200, {
      payment_id: 'pay_1',
      order_id: 'order-1',
      status: 'created',
      pay_url: 'https://pay.rollypay.io/pay/tok_1',
      amount: '150.50',
      payment_currency: 'RUB',
    });

  const res = await gateway.createPayment({
    amount: 150.5,
    currency: 'RUB',
    orderId: 'order-1',
    description: 'VIP - FreshDonate',
    successRedirectUrl: 'https://shop/ok',
    failRedirectUrl: 'https://shop/fail',
  });
  await gateway.createPayment({ amount: 1, currency: 'RUB', orderId: 'order-2' });

  assert.strictEqual(res.pay_url, 'https://pay.rollypay.io/pay/tok_1');
  assert.strictEqual(nonces.length, 2);
  assert.notStrictEqual(nonces[0], nonces[1]);
  assert.deepStrictEqual(captured, { amount: '1.00', payment_currency: 'RUB', order_id: 'order-2' });
});

test('createPayment — EUR goes through intl_card, test mode adds test flag', async () => {
  const gateway = new RollyPayGateway(API_KEY);
  let captured: any = null;

  nock(API)
    .post('/api/v1/payments', (body: any) => { captured = body; return true; })
    .reply(200, { payment_id: 'pay_2', pay_url: 'https://pay.rollypay.io/pay/tok_2' });

  await gateway.createPayment({ amount: 5, currency: 'EUR', orderId: 'order-3', test: true });

  assert.strictEqual(captured.payment_currency, 'EUR');
  assert.strictEqual(captured.payment_method, 'intl_card');
  assert.strictEqual(captured.test, true);
});

test('createPayment — wraps API errors into PaymentError with the provider message', async () => {
  const gateway = new RollyPayGateway(API_KEY);

  nock(API).post('/api/v1/payments').reply(400, { error: 'payment cap exceeded' });

  await assert.rejects(
    gateway.createPayment({ amount: 100, currency: 'RUB', orderId: 'order-4' }),
    (err: any) => err instanceof PaymentError && /400 payment cap exceeded/.test(err.message),
  );
});

test('verifyWebhookSignature — accepts HMAC of timestamp.body', () => {
  const body = '{"event_type":"payment.paid","status":"paid"}';
  const ts = '1761550000';

  assert.strictEqual(RollyPayGateway.verifyWebhookSignature(body, ts, sign(ts, body), SECRET), true);
  assert.strictEqual(RollyPayGateway.verifyWebhookSignature(Buffer.from(body), ts, sign(ts, body), SECRET), true);
});

test('verifyWebhookSignature — rejects tampered body, timestamp, secret or missing parts', () => {
  const body = '{"status":"paid"}';
  const ts = '1761550000';
  const sig = sign(ts, body);

  assert.strictEqual(RollyPayGateway.verifyWebhookSignature('{"status":"paid" }', ts, sig, SECRET), false);
  assert.strictEqual(RollyPayGateway.verifyWebhookSignature(body, '1761550001', sig, SECRET), false);
  assert.strictEqual(RollyPayGateway.verifyWebhookSignature(body, ts, sig, 'other'), false);
  assert.strictEqual(RollyPayGateway.verifyWebhookSignature(body, undefined, sig, SECRET), false);
  assert.strictEqual(RollyPayGateway.verifyWebhookSignature(body, ts, undefined, SECRET), false);
  assert.strictEqual(RollyPayGateway.verifyWebhookSignature(body, ts, 'zz', SECRET), false);
});
