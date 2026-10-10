import { test } from 'node:test';
import * as assert from 'node:assert';
import { PaymentProviderService } from '@/services/payment-provider.service';
import { PaymentProvider } from '@/models/payment-provider.model';

function robokassaRow() {
  const row = {
    id: 'provider-1',
    providerId: 'robokassa',
    name: 'Robokassa',
    description: 'Карты, СБП, электронные кошельки',
    icon: 'i-lucide-receipt',
    enabled: true,
    testMode: false,
    credentials: { merchantLogin: 'shop', password1: 'secret-1', password2: 'secret-2' } as Record<string, string>,
    providerConfig: { hashAlgorithm: 'sha256' },
    commissionPercent: 3.9,
    commissionRule: { mode: 'seller' },
    supportedCurrencies: ['RUB'],
    minAmount: 1,
    update: async (patch: Record<string, unknown>) => Object.assign(row, patch),
  };
  return row;
}

test('PaymentProviderService — never returns secret credentials', async (t) => {
  const row = robokassaRow();
  t.mock.method(PaymentProvider, 'findAll', async () => [row]);
  t.mock.method(PaymentProvider, 'create', async () => ({}));

  const [dto] = await new PaymentProviderService().findAll();

  assert.deepStrictEqual(dto.credentials, { merchantLogin: 'shop', password1: '', password2: '' });
  assert.deepStrictEqual(dto.secretCredentials, { password1: true, password2: true });
});

test('PaymentProviderService.update — empty secret keeps the stored value, filled one replaces it', async (t) => {
  const row = robokassaRow();
  t.mock.method(PaymentProvider, 'findAll', async () => [row]);
  t.mock.method(PaymentProvider, 'findOne', async () => row);
  t.mock.method(PaymentProvider, 'create', async () => ({}));

  const dto = await new PaymentProviderService().update('robokassa', {
    credentials: { merchantLogin: 'shop-2', password1: '', password2: 'secret-3', unknown: 'x' },
  });

  assert.deepStrictEqual(row.credentials, { merchantLogin: 'shop-2', password1: 'secret-1', password2: 'secret-3' });
  assert.deepStrictEqual(dto.credentials, { merchantLogin: 'shop-2', password1: '', password2: '' });
});
