import { test } from 'node:test';
import * as assert from 'node:assert';
import { SettingsService } from '../../src/services/settings.service';
import { Settings } from '../../src/models/settings.model';

test('SettingsService.get — reads the settings row once and serves repeats from memory', async (t) => {
  const row = {
    id: 'settings-1',
    installation_id: 'install-1',
    demo_payments: false,
    delivery_method: 'rcon',
    rcon_config: { host: '', port: 25575, password: '' },
    plugin_config: { token: 'token' },
    base_currency: 'RUB',
    currency_rates: { USD: 95, EUR: 100 },
  };
  const findOrCreate = t.mock.method(Settings, 'findOrCreate', async () => [row, false]);
  const service = new SettingsService();

  const first = await service.get();
  const second = await new SettingsService().get();

  assert.strictEqual(findOrCreate.mock.callCount(), 1);
  assert.strictEqual(first.plugin_config.token, 'token');
  assert.deepStrictEqual(second, first);
});
