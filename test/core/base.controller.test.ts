import { test } from 'node:test';
import * as assert from 'node:assert';
import { BaseController } from '../../src/core/base.controller';

// Expose protected methods via subclass
class TestCtrl extends BaseController {
  public doOk(reply: any, data?: unknown) { return this.ok(reply, data); }
  public doCreated(reply: any, data: unknown) { return this.created(reply, data); }
  public doNoContent(reply: any) { return this.noContent(reply); }
  public doGetPagination(request: any) { return this.getPagination(request); }
}

function makeReply() {
  const state: { code: number | null, payload: unknown } = { code: null, payload: undefined };
  const reply: any = {
    code(c: number) { state.code = c; return reply; },
    send(p: unknown) { state.payload = p; return reply; },
  };
  return { reply, state };
}

test('BaseController.ok — sends 200 with provided data', () => {
  const ctrl = new TestCtrl();
  const { reply, state } = makeReply();
  ctrl.doOk(reply, { hello: 'world' });
  assert.strictEqual(state.code, 200);
  assert.deepStrictEqual(state.payload, { hello: 'world' });
});

test('BaseController.ok — defaults to success:true', () => {
  const ctrl = new TestCtrl();
  const { reply, state } = makeReply();
  ctrl.doOk(reply);
  assert.strictEqual(state.code, 200);
  assert.deepStrictEqual(state.payload, { success: true });
});

test('BaseController.created — sends 201', () => {
  const ctrl = new TestCtrl();
  const { reply, state } = makeReply();
  ctrl.doCreated(reply, { id: 'x' });
  assert.strictEqual(state.code, 201);
  assert.deepStrictEqual(state.payload, { id: 'x' });
});

test('BaseController.noContent — sends 204 with no body', () => {
  const ctrl = new TestCtrl();
  const { reply, state } = makeReply();
  ctrl.doNoContent(reply);
  assert.strictEqual(state.code, 204);
  assert.strictEqual(state.payload, undefined);
});

test('BaseController.getPagination — defaults to page 1 limit 20', () => {
  const ctrl = new TestCtrl();
  const { page, limit } = ctrl.doGetPagination({ query: {} });
  assert.strictEqual(page, 1);
  assert.strictEqual(limit, 20);
});

test('BaseController.getPagination — parses query params', () => {
  const ctrl = new TestCtrl();
  const { page, limit } = ctrl.doGetPagination({ query: { page: '3', limit: '50' } });
  assert.strictEqual(page, 3);
  assert.strictEqual(limit, 50);
});

test('BaseController.getPagination — clamps page to >= 1', () => {
  const ctrl = new TestCtrl();
  const { page } = ctrl.doGetPagination({ query: { page: '-5' } });
  assert.strictEqual(page, 1);
});

test('BaseController.getPagination — clamps limit to [1, 100]', () => {
  const ctrl = new TestCtrl();
  // '0' is falsy so falls back to default 20
  assert.strictEqual(ctrl.doGetPagination({ query: { limit: '0' } }).limit, 20);
  // large values capped at 100
  assert.strictEqual(ctrl.doGetPagination({ query: { limit: '500' } }).limit, 100);
  // negative values coerced up to 1
  assert.strictEqual(ctrl.doGetPagination({ query: { limit: '-10' } }).limit, 1);
});

test('BaseController.getPagination — handles non-numeric query gracefully', () => {
  const ctrl = new TestCtrl();
  const { page, limit } = ctrl.doGetPagination({ query: { page: 'abc', limit: 'xyz' } });
  assert.strictEqual(page, 1);
  assert.strictEqual(limit, 20);
});
