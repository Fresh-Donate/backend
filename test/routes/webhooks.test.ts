import { test } from 'node:test';
import * as assert from 'node:assert';
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
