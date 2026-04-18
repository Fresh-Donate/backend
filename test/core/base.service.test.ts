import { test } from 'node:test';
import * as assert from 'node:assert';
import { BaseService, EntityNotFoundError } from '../../src/core/base.service';
import { BaseRepository } from '../../src/core/base.repository';

function makeRepo(overrides: Partial<Record<string, any>> = {}) {
  const defaults = {
    findAll: async () => [{ id: '1' }],
    findById: async (id: string) => (id === 'missing' ? null : { id }),
    findOne: async () => ({ id: '1' }),
    create: async (data: any) => ({ id: 'new', ...data }),
    update: async () => [1],
    delete: async () => 1,
    count: async () => 0,
    findAndCountAll: async () => ({ rows: [{ id: '1' }, { id: '2' }], count: 25 }),
  };
  return { ...defaults, ...overrides } as unknown as BaseRepository<any>;
}

class Svc extends BaseService<any> {
  protected get entityName(): string { return 'Widget'; }
}

test('BaseService.findAll — delegates to repo', async () => {
  const svc = new Svc(makeRepo());
  assert.deepStrictEqual(await svc.findAll(), [{ id: '1' }]);
});

test('BaseService.findById — returns null for missing', async () => {
  const svc = new Svc(makeRepo());
  assert.strictEqual(await svc.findById('missing'), null);
});

test('BaseService.findByIdOrFail — returns entity when found', async () => {
  const svc = new Svc(makeRepo());
  const result = await svc.findByIdOrFail('exists');
  assert.deepStrictEqual(result, { id: 'exists' });
});

test('BaseService.findByIdOrFail — throws EntityNotFoundError when missing', async () => {
  const svc = new Svc(makeRepo());
  await assert.rejects(
    svc.findByIdOrFail('missing'),
    (err: any) => {
      assert.ok(err instanceof EntityNotFoundError);
      assert.match(err.message, /Widget/);
      assert.match(err.message, /missing/);
      assert.strictEqual(err.statusCode, 404);
      return true;
    },
  );
});

test('BaseService.create — returns created entity', async () => {
  const svc = new Svc(makeRepo());
  const result = await svc.create({ x: 1 });
  assert.deepStrictEqual(result, { id: 'new', x: 1 });
});

test('BaseService.update — checks existence and returns updated', async () => {
  const svc = new Svc(makeRepo());
  const result = await svc.update('id1', { x: 2 });
  assert.deepStrictEqual(result, { id: 'id1' });
});

test('BaseService.update — fails if entity missing', async () => {
  const svc = new Svc(makeRepo());
  await assert.rejects(svc.update('missing', {}), EntityNotFoundError);
});

test('BaseService.delete — checks existence before deleting', async () => {
  let deleted = false;
  const repo = makeRepo({
    delete: async () => { deleted = true; return 1; },
  });
  const svc = new Svc(repo);
  await svc.delete('id1');
  assert.strictEqual(deleted, true);
});

test('BaseService.delete — fails if entity missing', async () => {
  const svc = new Svc(makeRepo());
  await assert.rejects(svc.delete('missing'), EntityNotFoundError);
});

test('BaseService.paginate — computes meta with default page/limit', async () => {
  const svc = new Svc(makeRepo());
  const result = await svc.paginate();
  assert.strictEqual(result.data.length, 2);
  assert.strictEqual(result.meta.total, 25);
  assert.strictEqual(result.meta.page, 1);
  assert.strictEqual(result.meta.limit, 20);
  assert.strictEqual(result.meta.totalPages, Math.ceil(25 / 20));
});

test('BaseService.paginate — applies custom page/limit offset', async () => {
  let receivedOptions: any = null;
  const repo = makeRepo({
    findAndCountAll: async (opts: any) => { receivedOptions = opts; return { rows: [], count: 100 }; },
  });
  const svc = new Svc(repo);
  const result = await svc.paginate(3, 10);
  assert.strictEqual(receivedOptions.limit, 10);
  assert.strictEqual(receivedOptions.offset, 20); // (3-1)*10
  assert.strictEqual(result.meta.totalPages, 10);
});

test('EntityNotFoundError — has name and 404 statusCode', () => {
  const err = new EntityNotFoundError('Foo', 'bar');
  assert.strictEqual(err.name, 'EntityNotFoundError');
  assert.strictEqual(err.statusCode, 404);
  assert.match(err.message, /Foo/);
  assert.match(err.message, /bar/);
  assert.ok(err instanceof Error);
});
