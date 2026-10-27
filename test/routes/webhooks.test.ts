import { test } from 'node:test';
import * as assert from 'node:assert';
import { createHmac } from 'node:crypto';
import { build } from '../helper';
import { PaymentProvider } from '../../src/models/payment-provider.model';
import { PaymentService } from '../../src/services/payment.service';

// We only exercise the validation paths that do NOT call into the
// payment service — calls that touch Sequelize hang on teardown with SKIP_DB=true
// because the lazy connection attempt never resolves.

test('POST /webhooks/yookassa — 400 on malformed body (missing fields)', async (t) => {
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/yookassa',
    payload: { type: 'notification' }, // missing event and object
  });

  assert.strictEqual(res.statusCode, 400);
});

test('POST /webhooks/yookassa — 400 on missing body', async (t) => {
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/yookassa',
    payload: {},
  });

  assert.strictEqual(res.statusCode, 400);
});

function skipSignature(t: { after: (fn: () => void) => void }, name: string) {
  process.env[name] = 'true';
  t.after(() => {
    delete process.env[name];
  });
}

test('POST /webhooks/wata — 500 when processing fails, so the provider retries', async (t) => {
  skipSignature(t, 'WATA_SKIP_SIGNATURE_CHECK');
  t.mock.method(PaymentProvider, 'findOne', async () => ({ credentials: {}, testMode: false }));
  t.mock.method(PaymentService.prototype, 'handleWataWebhook', async () => {
    throw new Error('database is down');
  });
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/wata',
    payload: { transactionStatus: 'Paid', orderId: 'order-1' },
  });

  assert.strictEqual(res.statusCode, 500);
});

test('POST /webhooks/wata — 200 once the payment is processed', async (t) => {
  skipSignature(t, 'WATA_SKIP_SIGNATURE_CHECK');
  t.mock.method(PaymentProvider, 'findOne', async () => ({ credentials: {}, testMode: false }));
  t.mock.method(PaymentService.prototype, 'handleWataWebhook', async () => {});
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/wata',
    payload: { transactionStatus: 'Paid', orderId: 'order-1' },
  });

  assert.strictEqual(res.statusCode, 200);
});

test('POST /webhooks/robokassa — no OK answer when processing fails, so Robokassa keeps retrying', async (t) => {
  skipSignature(t, 'ROBOKASSA_SKIP_SIGNATURE_CHECK');
  t.mock.method(PaymentProvider, 'findOne', async () => ({ credentials: {}, testMode: false, providerConfig: {} }));
  t.mock.method(PaymentService.prototype, 'handleRobokassaWebhook', async () => {
    throw new Error('database is down');
  });
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/robokassa',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'InvId=5&OutSum=10.00',
  });

  assert.strictEqual(res.statusCode, 500);
  assert.notStrictEqual(res.payload, 'OK5');
});

test('POST /webhooks/rollypay — 403 on a bad signature', async (t) => {
  t.mock.method(PaymentProvider, 'findOne', async () => ({ credentials: { signingSecret: 'secret' }, testMode: false }));
  const handle = t.mock.method(PaymentService.prototype, 'handleRollyPayWebhook', async () => {});
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/rollypay',
    headers: { 'x-signature': 'deadbeef', 'x-timestamp': '1761550000' },
    payload: { status: 'paid', order_id: 'order-1' },
  });

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(handle.mock.callCount(), 0);
});

test('POST /webhooks/rollypay — 200 with a valid signature over the raw body', async (t) => {
  t.mock.method(PaymentProvider, 'findOne', async () => ({ credentials: { signingSecret: 'secret' }, testMode: false }));
  const handle = t.mock.method(PaymentService.prototype, 'handleRollyPayWebhook', async () => {});
  const app = await build(t);

  const body = '{"event_type":"payment.paid","status":"paid","order_id":"order-1"}';
  const ts = '1761550000';
  const signature = createHmac('sha256', 'secret').update(`${ts}.${body}`).digest('hex');

  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/rollypay',
    headers: { 'content-type': 'application/json', 'x-signature': signature, 'x-timestamp': ts },
    payload: body,
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(handle.mock.callCount(), 1);
});

test('POST /webhooks/rollypay — 500 when processing fails, so RollyPay retries', async (t) => {
  skipSignature(t, 'ROLLYPAY_SKIP_SIGNATURE_CHECK');
  t.mock.method(PaymentProvider, 'findOne', async () => ({ credentials: {}, testMode: false }));
  t.mock.method(PaymentService.prototype, 'handleRollyPayWebhook', async () => {
    throw new Error('database is down');
  });
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/rollypay',
    payload: { status: 'paid', order_id: 'order-1' },
  });

  assert.strictEqual(res.statusCode, 500);
});
