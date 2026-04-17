import { test } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../helper';

// These tests exercise the X-Api-Key auth gate. Paths that hit the DB
// are not tested here because we run with SKIP_DB=true.

test('GET /plugin/ping — 401 without X-Api-Key header', async (t) => {
  const app = await build(t);

  const res = await app.inject({ method: 'GET', url: '/plugin/ping' });

  assert.strictEqual(res.statusCode, 401);
  const body = JSON.parse(res.payload);
  assert.match(body.error, /X-Api-Key/);
});

test('GET /plugin/deliveries/pending — 401 without X-Api-Key header', async (t) => {
  const app = await build(t);

  const res = await app.inject({ method: 'GET', url: '/plugin/deliveries/pending' });

  assert.strictEqual(res.statusCode, 401);
});

test('POST /plugin/deliveries/:id/result — 401 without X-Api-Key', async (t) => {
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/plugin/deliveries/some-id/result',
    payload: { success: true, logs: [] },
  });

  assert.strictEqual(res.statusCode, 401);
});
