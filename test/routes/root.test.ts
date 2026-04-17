import { test } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../helper';

test('GET / — returns service info', async (t) => {
  const app = await build(t);

  const res = await app.inject({ url: '/' });
  const body = JSON.parse(res.payload);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(body.name, 'FreshDonate API');
  assert.strictEqual(body.status, 'running');
  assert.ok(typeof body.version === 'string');
});

test('GET /health — returns ok status with timestamp', async (t) => {
  const app = await build(t);

  const res = await app.inject({ url: '/health' });
  const body = JSON.parse(res.payload);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(body.status, 'ok');
  assert.ok(typeof body.timestamp === 'string');
  // Must be a valid ISO date
  assert.ok(!isNaN(Date.parse(body.timestamp)));
});
