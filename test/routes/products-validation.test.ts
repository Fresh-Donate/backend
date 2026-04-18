import { test } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../helper';

// Admin-protected POST /products validates body — but auth is checked first.
// With a valid token, validation errors produce 400; without, we get 401.
// These tests pass a valid JWT to exercise the schema validation path.

const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = 'admin';

async function loginAndGetToken(app: any): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
  });
  return JSON.parse(res.payload).token;
}

test('POST /products — 400 when name too short (empty string)', async (t) => {
  const app = await build(t);
  const token = await loginAndGetToken(app);

  const res = await app.inject({
    method: 'POST',
    url: '/products',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: '', price: 10, currency: 'RUB', quantity: 1, type: 'item' },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /products — 400 when price below minimum', async (t) => {
  const app = await build(t);
  const token = await loginAndGetToken(app);

  const res = await app.inject({
    method: 'POST',
    url: '/products',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Sword', price: 0, currency: 'RUB', quantity: 1, type: 'item' },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /products — 400 when quantity is negative', async (t) => {
  const app = await build(t);
  const token = await loginAndGetToken(app);

  const res = await app.inject({
    method: 'POST',
    url: '/products',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Sword', price: 10, currency: 'RUB', quantity: -1, type: 'item' },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /products — 400 when required field missing', async (t) => {
  const app = await build(t);
  const token = await loginAndGetToken(app);

  const res = await app.inject({
    method: 'POST',
    url: '/products',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Sword', price: 10, currency: 'RUB' }, // missing quantity and type
  });
  assert.strictEqual(res.statusCode, 400);
});

test('POST /products — 400 when name exceeds 128 chars', async (t) => {
  const app = await build(t);
  const token = await loginAndGetToken(app);

  const res = await app.inject({
    method: 'POST',
    url: '/products',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'a'.repeat(129), price: 10, currency: 'RUB', quantity: 1, type: 'item' },
  });
  assert.strictEqual(res.statusCode, 400);
});
