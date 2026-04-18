import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  PaymentError,
} from '../../src/core/errors';

test('AppError — sets message, statusCode, code and name', () => {
  const err = new AppError('oops', 418, 'TEAPOT');
  assert.strictEqual(err.message, 'oops');
  assert.strictEqual(err.statusCode, 418);
  assert.strictEqual(err.code, 'TEAPOT');
  assert.strictEqual(err.name, 'AppError');
  assert.ok(err instanceof Error);
});

test('AppError — defaults statusCode to 500 and code to undefined', () => {
  const err = new AppError('generic');
  assert.strictEqual(err.statusCode, 500);
  assert.strictEqual(err.code, undefined);
});

test('ValidationError — 400 and VALIDATION_ERROR', () => {
  const err = new ValidationError('bad input');
  assert.strictEqual(err.statusCode, 400);
  assert.strictEqual(err.code, 'VALIDATION_ERROR');
  assert.strictEqual(err.name, 'ValidationError');
  assert.ok(err instanceof AppError);
});

test('UnauthorizedError — default message and 401', () => {
  const err = new UnauthorizedError();
  assert.strictEqual(err.message, 'Unauthorized');
  assert.strictEqual(err.statusCode, 401);
  assert.strictEqual(err.code, 'UNAUTHORIZED');
});

test('UnauthorizedError — custom message', () => {
  const err = new UnauthorizedError('token expired');
  assert.strictEqual(err.message, 'token expired');
});

test('ForbiddenError — default message and 403', () => {
  const err = new ForbiddenError();
  assert.strictEqual(err.message, 'Forbidden');
  assert.strictEqual(err.statusCode, 403);
  assert.strictEqual(err.code, 'FORBIDDEN');
});

test('NotFoundError — default message and 404', () => {
  const err = new NotFoundError();
  assert.strictEqual(err.message, 'Not found');
  assert.strictEqual(err.statusCode, 404);
  assert.strictEqual(err.code, 'NOT_FOUND');
});

test('NotFoundError — custom message', () => {
  const err = new NotFoundError('User 42 not found');
  assert.strictEqual(err.message, 'User 42 not found');
});

test('ConflictError — 409 and CONFLICT', () => {
  const err = new ConflictError('already exists');
  assert.strictEqual(err.statusCode, 409);
  assert.strictEqual(err.code, 'CONFLICT');
});

test('PaymentError — 502 with default code', () => {
  const err = new PaymentError('gateway down');
  assert.strictEqual(err.statusCode, 502);
  assert.strictEqual(err.code, 'PAYMENT_ERROR');
});

test('PaymentError — custom code', () => {
  const err = new PaymentError('yoo failure', 'YOOKASSA_CREATE_ERROR');
  assert.strictEqual(err.code, 'YOOKASSA_CREATE_ERROR');
});

test('Errors — instanceof chain preserved', () => {
  assert.ok(new ValidationError('x') instanceof AppError);
  assert.ok(new NotFoundError() instanceof AppError);
  assert.ok(new PaymentError('y') instanceof AppError);
  assert.ok(new ForbiddenError() instanceof Error);
});
