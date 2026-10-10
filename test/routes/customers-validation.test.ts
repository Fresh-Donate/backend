import { test } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../helper';

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

test('GET /customers — 400 when `from` is not a date', async (t) => {
  const app = await build(t);
  const token = await loginAndGetToken(app);

  const res = await app.inject({
    method: 'GET',
    url: '/customers?from=not-a-date',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('GET /customers — 400 when `to` is not a date', async (t) => {
  const app = await build(t);
  const token = await loginAndGetToken(app);

  const res = await app.inject({
    method: 'GET',
    url: '/customers?to=2026-13-45',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('GET /customers/:nickname — 400 when `from` is not a date', async (t) => {
  const app = await build(t);
  const token = await loginAndGetToken(app);

  const res = await app.inject({
    method: 'GET',
    url: '/customers/Notch?from=yesterday',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(res.statusCode, 400);
});

test('GET /customers — 401 without a token', async (t) => {
  const app = await build(t);

  const res = await app.inject({ method: 'GET', url: '/customers?from=not-a-date' });
  assert.strictEqual(res.statusCode, 401);
});
