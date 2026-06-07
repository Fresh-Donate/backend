import { test } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../helper';

// POST /payments/cart is public but validates input via schema before any DB
// access (we run with SKIP_DB=true). These tests assert schema rejection.

test('POST /payments/cart — 400 when body is empty', async (t) => {
  const app = await build(t);
  const res = await app.inject({ method: 'POST', url: '/payments/cart', payload: {} });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /payments/cart — 400 when items array is empty', async (t) => {
  const app = await build(t);
  const res = await app.inject({
    method: 'POST',
    url: '/payments/cart',
    payload: { items: [], nickname: 'Steve', email: 'a@b.com', paymentOptionId: 'o1' },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /payments/cart — 400 when an item is missing productId', async (t) => {
  const app = await build(t);
  const res = await app.inject({
    method: 'POST',
    url: '/payments/cart',
    payload: { items: [{ count: 2 }], nickname: 'Steve', email: 'a@b.com', paymentOptionId: 'o1' },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /payments/cart — 400 on invalid nickname', async (t) => {
  const app = await build(t);
  const res = await app.inject({
    method: 'POST',
    url: '/payments/cart',
    payload: { items: [{ productId: 'p1' }], nickname: 'a', email: 'a@b.com', paymentOptionId: 'o1' },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /payments/cart — 400 on invalid email', async (t) => {
  const app = await build(t);
  const res = await app.inject({
    method: 'POST',
    url: '/payments/cart',
    payload: { items: [{ productId: 'p1' }], nickname: 'Steve', email: 'nope', paymentOptionId: 'o1' },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /payments/cart — 400 when more than 20 items', async (t) => {
  const app = await build(t);
  const items = Array.from({ length: 21 }, (_, i) => ({ productId: `p${i}` }));
  const res = await app.inject({
    method: 'POST',
    url: '/payments/cart',
    payload: { items, nickname: 'Steve', email: 'a@b.com', paymentOptionId: 'o1' },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /payments/cart/preview — 400 when items missing', async (t) => {
  const app = await build(t);
  const res = await app.inject({ method: 'POST', url: '/payments/cart/preview', payload: {} });
  assert.strictEqual(res.statusCode, 400);
});
