import { test } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../helper';

// Match the default admin credentials from src/config/index.ts
const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = 'admin';

test('POST /auth/login — returns JWT for valid credentials', async (t) => {
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
  });

  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.payload);
  assert.ok(typeof body.token === 'string' && body.token.length > 0);
  assert.strictEqual(body.user.login, ADMIN_LOGIN);
  assert.strictEqual(body.user.role, 'admin');
});

test('POST /auth/login — 401 on wrong password', async (t) => {
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: ADMIN_LOGIN, password: 'wrong-password' },
  });

  assert.strictEqual(res.statusCode, 401);
});

test('POST /auth/login — 401 on wrong login', async (t) => {
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: 'nobody', password: ADMIN_PASSWORD },
  });

  assert.strictEqual(res.statusCode, 401);
});

test('POST /auth/login — 400 when missing fields', async (t) => {
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: 'x' },
  });

  assert.strictEqual(res.statusCode, 400);
});

test('POST /auth/login — 400 with empty strings', async (t) => {
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: '', password: '' },
  });

  assert.strictEqual(res.statusCode, 400);
});

test('GET /auth/me — 401 without token', async (t) => {
  const app = await build(t);

  const res = await app.inject({ method: 'GET', url: '/auth/me' });

  assert.strictEqual(res.statusCode, 401);
});

test('GET /auth/me — returns user info with valid token', async (t) => {
  const app = await build(t);

  // First get a token
  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
  });
  const { token } = JSON.parse(loginRes.payload);

  const res = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { authorization: `Bearer ${token}` },
  });

  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.user.login, ADMIN_LOGIN);
  assert.strictEqual(body.user.role, 'admin');
});

test('GET /auth/me — 401 with invalid token', async (t) => {
  const app = await build(t);

  const res = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { authorization: 'Bearer invalid.token.here' },
  });

  assert.strictEqual(res.statusCode, 401);
});
