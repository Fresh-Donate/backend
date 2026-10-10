import { test } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../helper';
import { SettingsService } from '@/services/settings.service';
import { Settings } from '@/models/settings.model';

function settingsRow() {
  const row = {
    id: 'settings-1',
    installation_id: 'install-1',
    demo_payments: false,
    delivery_method: 'rcon',
    rcon_config: { host: '', port: 25575, password: '' },
    plugin_config: { token: 'token' },
    base_currency: 'RUB',
    currency_rates: { USD: 95, EUR: 100 },
    smtp_config: {
      enabled: true,
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: 'shop@example.com',
      password: 'smtp-secret',
      fromEmail: 'shop@example.com',
      fromName: 'Shop',
    },
    update: async (patch: Record<string, unknown>) => Object.assign(row, patch),
  };
  return row;
}

test('GET /settings — does not return the SMTP password', async (t) => {
  const row = settingsRow();
  t.mock.method(Settings, 'findOrCreate', async () => [row, false]);
  const app = await build(t);
  const token = app.jwt.sign({ id: 'admin', login: 'admin', role: 'admin' });

  const res = await app.inject({ method: 'GET', url: '/settings', headers: { authorization: `Bearer ${token}` } });
  assert.strictEqual(res.statusCode, 200);

  const body = JSON.parse(res.payload);
  assert.strictEqual(body.smtp_config.password, '');
  assert.strictEqual(body.smtp_config.passwordSet, true);
  assert.strictEqual((await new SettingsService().get()).smtp_config.password, 'smtp-secret');
});

test('SettingsService.update — empty SMTP password keeps the stored one, filled one replaces it', async (t) => {
  const row = settingsRow();
  t.mock.method(Settings, 'findOrCreate', async () => [row, false]);
  const service = new SettingsService();

  await service.update({ smtp_config: { ...row.smtp_config, password: '' } });
  assert.strictEqual(row.smtp_config.password, 'smtp-secret');

  await service.update({ smtp_config: { ...row.smtp_config, password: 'new-secret' } });
  assert.strictEqual(row.smtp_config.password, 'new-secret');
});

test('SettingsService.update — clearing the SMTP login drops the password', async (t) => {
  const row = settingsRow();
  t.mock.method(Settings, 'findOrCreate', async () => [row, false]);

  await new SettingsService().update({ smtp_config: { ...row.smtp_config, user: '', password: '' } });

  assert.strictEqual(row.smtp_config.password, '');
});
