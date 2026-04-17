import { test } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../helper';

// We only exercise the validation/IP-check paths that do NOT call into the
// payment service — calls that touch Sequelize hang on teardown with SKIP_DB=true
// because the lazy connection attempt never resolves.

test('POST /webhooks/yookassa — 403 when source IP not in allowlist', async (t) => {
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/webhooks/yookassa',
    payload: {
      type: 'notification',
      event: 'payment.succeeded',
      object: { id: 'pay_test' },
    },
  });

  assert.strictEqual(res.statusCode, 403);
});

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
