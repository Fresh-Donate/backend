import { test, type TestContext } from 'node:test';
import * as assert from 'node:assert';
import { SettingsService } from '../../src/services/settings.service';
import { Settings } from '../../src/models/settings.model';

function stubSettingsRow(t: TestContext, jwtSecret: string | null) {
  let stored = jwtSecret;
  const row = {
    id: 'settings-1',
    installation_id: 'install-1',
    get jwt_secret() {
      return stored;
    },
    reload: async () => row,
  };
  t.mock.method(Settings, 'findOrCreate', async () => [row, false]);
  const update = t.mock.method(Settings, 'update', async (values: { jwt_secret: string }, options: { where: Record<string, unknown> }) => {
    if (options.where.jwt_secret === null && stored === null) stored = values.jwt_secret;
    return [1];
  });
  return { update };
}

test('getJwtSecret — returns the stored secret without rewriting it', async (t) => {
  const { update } = stubSettingsRow(t, 'existing-secret');

  assert.strictEqual(await new SettingsService().getJwtSecret(), 'existing-secret');
  assert.strictEqual(update.mock.callCount(), 0);
});

test('getJwtSecret — generates a long random secret once and keeps it', async (t) => {
  const { update } = stubSettingsRow(t, null);
  const service = new SettingsService();

  const first = await service.getJwtSecret();
  const second = await service.getJwtSecret();

  assert.ok(first.length >= 64);
  assert.strictEqual(first, second);
  assert.strictEqual(update.mock.callCount(), 1);
});
