import { test } from 'node:test';
import * as assert from 'node:assert';
import Fastify from 'fastify';
import errorHandler from '../../src/plugins/error-handler';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  PaymentError,
} from '../../src/core/errors';
import { EntityNotFoundError } from '../../src/core/base.service';

async function buildApp() {
  const app = Fastify();
  await app.register(errorHandler);
  return app;
}

test('error-handler — formats AppError with statusCode, name and code', async () => {
  const app = await buildApp();
  app.get('/boom', async () => { throw new AppError('custom', 418, 'TEAPOT'); });

  const res = await app.inject({ url: '/boom' });
  assert.strictEqual(res.statusCode, 418);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.error, 'AppError');
  assert.strictEqual(body.message, 'custom');
  assert.strictEqual(body.code, 'TEAPOT');

  await app.close();
});

test('error-handler — ValidationError returns 400', async () => {
  const app = await buildApp();
  app.get('/v', async () => { throw new ValidationError('bad input'); });

  const res = await app.inject({ url: '/v' });
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.code, 'VALIDATION_ERROR');

  await app.close();
});

test('error-handler — UnauthorizedError returns 401', async () => {
  const app = await buildApp();
  app.get('/u', async () => { throw new UnauthorizedError(); });

  const res = await app.inject({ url: '/u' });
  assert.strictEqual(res.statusCode, 401);

  await app.close();
});

test('error-handler — NotFoundError returns 404', async () => {
  const app = await buildApp();
  app.get('/nf', async () => { throw new NotFoundError('no widget'); });

  const res = await app.inject({ url: '/nf' });
  assert.strictEqual(res.statusCode, 404);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.message, 'no widget');

  await app.close();
});

test('error-handler — ConflictError returns 409', async () => {
  const app = await buildApp();
  app.get('/c', async () => { throw new ConflictError('dup'); });

  const res = await app.inject({ url: '/c' });
  assert.strictEqual(res.statusCode, 409);

  await app.close();
});

test('error-handler — PaymentError returns 502', async () => {
  const app = await buildApp();
  app.get('/p', async () => { throw new PaymentError('gateway down'); });

  const res = await app.inject({ url: '/p' });
  assert.strictEqual(res.statusCode, 502);

  await app.close();
});

test('error-handler — EntityNotFoundError returns 404 with message', async () => {
  const app = await buildApp();
  app.get('/en', async () => { throw new EntityNotFoundError('Widget', 'id-1'); });

  const res = await app.inject({ url: '/en' });
  assert.strictEqual(res.statusCode, 404);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.error, 'EntityNotFoundError');
  assert.match(body.message, /Widget/);

  await app.close();
});

test('error-handler — validation errors (fastify schema) return 400 with details', async () => {
  const app = await buildApp();
  app.post<{ Body: { name: string } }>('/schema', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 3 } },
      },
    },
  }, async () => ({ ok: true }));

  const res = await app.inject({ method: 'POST', url: '/schema', payload: {} });
  assert.strictEqual(res.statusCode, 400);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.error, 'ValidationError');
  assert.ok(Array.isArray(body.details));

  await app.close();
});

test('error-handler — unexpected error returns 500 with generic message in prod', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const app = await buildApp();
  app.get('/oops', async () => { throw new Error('secret internals'); });

  const res = await app.inject({ url: '/oops' });
  assert.strictEqual(res.statusCode, 500);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.error, 'InternalServerError');
  assert.notStrictEqual(body.message, 'secret internals');
  assert.strictEqual(body.stack, undefined);

  await app.close();
  process.env.NODE_ENV = prev;
});

test('error-handler — unexpected error exposes stack and message in development', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  const app = await buildApp();
  app.get('/oops', async () => { throw new Error('leak-ok-in-dev'); });

  const res = await app.inject({ url: '/oops' });
  assert.strictEqual(res.statusCode, 500);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.message, 'leak-ok-in-dev');
  assert.ok(typeof body.stack === 'string');

  await app.close();
  process.env.NODE_ENV = prev;
});
