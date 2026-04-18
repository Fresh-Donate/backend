import { test } from 'node:test';
import * as assert from 'node:assert';
import { BaseRepository } from '../../src/core/base.repository';

// Minimal mock of a Sequelize ModelStatic — we only need the call shapes
function makeModelMock() {
  const calls: Record<string, any[]> = {
    findAll: [],
    findByPk: [],
    findOne: [],
    create: [],
    update: [],
    destroy: [],
    count: [],
    findAndCountAll: [],
  };

  const model = {
    findAll: async (options?: any) => { calls.findAll.push(options); return [{ id: '1' }]; },
    findByPk: async (id: string, options?: any) => { calls.findByPk.push({ id, options }); return { id }; },
    findOne: async (options?: any) => { calls.findOne.push(options); return { id: '1' }; },
    create: async (data: any, options?: any) => { calls.create.push({ data, options }); return { id: 'new', ...data }; },
    update: async (data: any, options: any) => { calls.update.push({ data, options }); return [1]; },
    destroy: async (options: any) => { calls.destroy.push(options); return 1; },
    count: async (options?: any) => { calls.count.push(options); return 42; },
    findAndCountAll: async (options?: any) => { calls.findAndCountAll.push(options); return { rows: [{ id: '1' }], count: 1 }; },
  };

  return { model, calls };
}

class TestRepo extends BaseRepository<any> {}

test('BaseRepository.findAll — forwards to model', async () => {
  const { model, calls } = makeModelMock();
  const repo = new TestRepo(model as any);
  const result = await repo.findAll({ limit: 5 } as any);
  assert.deepStrictEqual(result, [{ id: '1' }]);
  assert.deepStrictEqual(calls.findAll[0], { limit: 5 });
});

test('BaseRepository.findById — uses findByPk with id', async () => {
  const { model, calls } = makeModelMock();
  const repo = new TestRepo(model as any);
  const result = await repo.findById('abc');
  assert.deepStrictEqual(result, { id: 'abc' });
  assert.strictEqual(calls.findByPk[0].id, 'abc');
});

test('BaseRepository.findOne — forwards options', async () => {
  const { model, calls } = makeModelMock();
  const repo = new TestRepo(model as any);
  await repo.findOne({ where: { name: 'x' } } as any);
  assert.deepStrictEqual(calls.findOne[0], { where: { name: 'x' } });
});

test('BaseRepository.create — returns created entity', async () => {
  const { model, calls } = makeModelMock();
  const repo = new TestRepo(model as any);
  const result = await repo.create({ name: 'foo' } as any);
  assert.deepStrictEqual(result, { id: 'new', name: 'foo' });
  assert.deepStrictEqual(calls.create[0].data, { name: 'foo' });
});

test('BaseRepository.update — wraps id in where clause', async () => {
  const { model, calls } = makeModelMock();
  const repo = new TestRepo(model as any);
  const result = await repo.update('id-1', { name: 'new' } as any);
  assert.deepStrictEqual(result, [1]);
  assert.deepStrictEqual(calls.update[0].options.where, { id: 'id-1' });
});

test('BaseRepository.delete — wraps id in where clause', async () => {
  const { model, calls } = makeModelMock();
  const repo = new TestRepo(model as any);
  const result = await repo.delete('id-1');
  assert.strictEqual(result, 1);
  assert.deepStrictEqual(calls.destroy[0].where, { id: 'id-1' });
});

test('BaseRepository.count — returns count', async () => {
  const { model } = makeModelMock();
  const repo = new TestRepo(model as any);
  const result = await repo.count();
  assert.strictEqual(result, 42);
});

test('BaseRepository.findAndCountAll — returns rows and count', async () => {
  const { model } = makeModelMock();
  const repo = new TestRepo(model as any);
  const result = await repo.findAndCountAll();
  assert.deepStrictEqual(result, { rows: [{ id: '1' }], count: 1 });
});
