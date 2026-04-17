import { test } from 'node:test';
import * as assert from 'node:assert';
import Fastify from 'fastify';
import jwtPlugin from '../../src/plugins/jwt';

async function buildApp() {
  const app = Fastify();
  // jwtPlugin is typed with FastifyJWTOptions requiring `secret`; it reads secret from config at runtime,
  // so we cast to any to satisfy the compiler.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(jwtPlugin as any);
  app.get('/public', async () => ({ ok: true }));
  app.get('/protected', { onRequest: [app.authenticate] }, async (req) => ({ user: req.user }));
  return app;
}

test('jwt plugin — decorates fastify with authenticate', async () => {
  const app = await buildApp();
  assert.strictEqual(typeof app.authenticate, 'function');
  await app.close();
});

test('jwt plugin — public route needs no token', async () => {
  const app = await buildApp();
  const res = await app.inject({ url: '/public' });
  assert.strictEqual(res.statusCode, 200);
  await app.close();
});

test('jwt plugin — protected route returns 401 without token', async () => {
  const app = await buildApp();
  const res = await app.inject({ url: '/protected' });
  assert.strictEqual(res.statusCode, 401);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.error, 'Unauthorized');
  await app.close();
});

test('jwt plugin — protected route returns 401 with malformed token', async () => {
  const app = await buildApp();
  const res = await app.inject({
    url: '/protected',
    headers: { authorization: 'Bearer not-a-valid-jwt' },
  });
  assert.strictEqual(res.statusCode, 401);
  await app.close();
});

test('jwt plugin — protected route accepts valid signed token', async () => {
  const app = await buildApp();
  const token = app.jwt.sign({ id: 'u1', login: 'user', role: 'admin' });

  const res = await app.inject({
    url: '/protected',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.user.login, 'user');
  assert.strictEqual(body.user.role, 'admin');
  await app.close();
});

test('jwt plugin — rejects token with tampered signature', async () => {
  const app = await buildApp();
  const token = app.jwt.sign({ id: 'u1', login: 'user', role: 'admin' });

  // Corrupt the signature (last segment after the second dot)
  const parts = token.split('.');
  parts[2] = 'AAAA' + parts[2].slice(4);
  const tampered = parts.join('.');

  const res = await app.inject({
    url: '/protected',
    headers: { authorization: `Bearer ${tampered}` },
  });
  assert.strictEqual(res.statusCode, 401);
  await app.close();
});
