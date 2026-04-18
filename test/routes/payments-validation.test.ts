import { test } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../helper';

// POST /payments is public but validates input via schema.
// These tests verify schema rejection happens before DB access.

test('POST /payments — 400 when body is empty', async (t) => {
  const app = await build(t);
  const res = await app.inject({ method: 'POST', url: '/payments', payload: {} });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /payments — 400 when nickname is empty', async (t) => {
  const app = await build(t);
  const res = await app.inject({
    method: 'POST',
    url: '/payments',
    payload: { productId: 'p1', nickname: '', email: 'a@b.com', paymentOptionId: 'o1' },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /payments — 400 on invalid email format', async (t) => {
  const app = await build(t);
  const res = await app.inject({
    method: 'POST',
    url: '/payments',
    payload: { productId: 'p1', nickname: 'Steve', email: 'not-an-email', paymentOptionId: 'o1' },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /payments — 400 when nickname exceeds 64 chars', async (t) => {
  const app = await build(t);
  const longName = 'a'.repeat(65);
  const res = await app.inject({
    method: 'POST',
    url: '/payments',
    payload: { productId: 'p1', nickname: longName, email: 'a@b.com', paymentOptionId: 'o1' },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /payments — 400 when required field missing', async (t) => {
  const app = await build(t);
  const res = await app.inject({
    method: 'POST',
    url: '/payments',
    payload: { nickname: 'Steve', email: 'a@b.com' }, // missing productId and paymentOptionId
  });
  assert.strictEqual(res.statusCode, 400);
});
