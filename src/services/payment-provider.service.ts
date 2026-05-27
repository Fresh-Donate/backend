import { PaymentProvider } from '@/models/payment-provider.model';
import { NotFoundError } from '@/core';
import type { PaymentProviderDto, UpdatePaymentProviderDto } from '@/types';

interface ProviderDefinition {
  providerId: string;
  name: string;
  description: string;
  icon: string;
  credentials: Record<string, string>;
  providerConfig: Record<string, any>;
  commissionPercent: number;
  supportedCurrencies: string[];
}

const DEFAULT_PROVIDERS: ProviderDefinition[] = [
  {
    providerId: 'yookassa',
    name: 'ЮKassa',
    description: 'Приём платежей для РФ: банковские карты, СБП, ЮMoney, SberPay, T-Pay',
    icon: 'i-lucide-credit-card',
    credentials: { shopId: '', secretKey: '' },
    providerConfig: {},
    commissionPercent: 2.8,
    supportedCurrencies: ['RUB'],
  },
  {
    providerId: 'heleket',
    name: 'Heleket',
    description: 'Криптовалютные платежи: BTC, ETH, USDT и другие',
    icon: 'i-lucide-bitcoin',
    credentials: { apiKey: '', merchantId: '' },
    providerConfig: {},
    commissionPercent: 0.5,
    supportedCurrencies: ['USD'],
  },
  {
    providerId: 'wata',
    name: 'Wata',
    description: 'Приём платежей: банковские карты, СБП. Поддерживает песочницу.',
    icon: 'i-lucide-wallet',
    credentials: { apiKey: '' },
    providerConfig: {},
    commissionPercent: 2.5,
    supportedCurrencies: ['RUB'],
  },
  {
    providerId: 'tebex',
    name: 'Tebex',
    description: 'Tebex Headless API. Принимает платежи в валюте Tebex-аккаунта (USD или EUR), требует базовой проверки личности и заведения 6 coin-пакетов в Tebex Dashboard (0.01 / 0.1 / 1 / 10 / 100 / 1000).',
    icon: 'i-lucide-gamepad-2',
    credentials: { webstoreToken: '', privateKey: '', webhookSecret: '' },
    providerConfig: {
      coinPackages: {
        '1000': '',
        '100': '',
        '10': '',
        '1': '',
        '0.1': '',
        '0.01': '',
      },
    },
    commissionPercent: 5,
    supportedCurrencies: ['USD'],
  },
];

function toDto(p: PaymentProvider): PaymentProviderDto {
  return {
    id: p.id,
    providerId: p.providerId,
    name: p.name,
    description: p.description,
    icon: p.icon,
    enabled: p.enabled,
    testMode: p.testMode,
    credentials: p.credentials,
    providerConfig: p.providerConfig || {},
    commissionPercent: Number(p.commissionPercent),
    commissionRule: p.commissionRule,
    supportedCurrencies: p.supportedCurrencies,
    minAmount: Number(p.minAmount),
  };
}

export class PaymentProviderService {
  private seeded = false;

  private async seed(): Promise<void> {
    if (this.seeded) return;

    const existing = await PaymentProvider.findAll();
    const byProviderId = new Map(existing.map((p) => [p.providerId, p]));

    for (const def of DEFAULT_PROVIDERS) {
      const current = byProviderId.get(def.providerId);
      if (!current) {
        await PaymentProvider.create({
          ...def,
          commissionRule: { mode: 'seller' },
        });
        continue;
      }

      // Backfill missing credential / providerConfig keys
      const mergedCredentials: Record<string, string> = { ...def.credentials, ...(current.credentials || {}) };
      const mergedProviderConfig = mergeProviderConfig(def.providerConfig, current.providerConfig);

      const diff: Record<string, any> = {};
      if (current.description !== def.description) diff.description = def.description;
      if (current.icon !== def.icon) diff.icon = def.icon;
      if (JSON.stringify(current.credentials || {}) !== JSON.stringify(mergedCredentials)) {
        diff.credentials = mergedCredentials;
      }
      if (JSON.stringify(current.providerConfig || {}) !== JSON.stringify(mergedProviderConfig)) {
        diff.providerConfig = mergedProviderConfig;
      }
      if (Object.keys(diff).length > 0) {
        await current.update(diff);
      }
    }

    this.seeded = true;
  }

  async findAll(): Promise<PaymentProviderDto[]> {
    await this.seed();
    const providers = await PaymentProvider.findAll({ order: [['created_at', 'ASC']] });
    return providers.map(toDto);
  }

  async findByProviderId(providerId: string): Promise<PaymentProviderDto | null> {
    await this.seed();
    const provider = await PaymentProvider.findOne({ where: { providerId } });
    return provider ? toDto(provider) : null;
  }

  async update(providerId: string, data: UpdatePaymentProviderDto): Promise<PaymentProviderDto> {
    await this.seed();
    const provider = await PaymentProvider.findOne({ where: { providerId } });
    if (!provider) {
      throw new NotFoundError(`Payment provider "${providerId}" not found`);
    }

    await provider.update(data);
    return toDto(provider);
  }
}

function mergeProviderConfig(
  defaults: Record<string, any>,
  current: Record<string, any> | undefined,
): Record<string, any> {
  const result: Record<string, any> = { ...(current || {}) };
  for (const [key, defValue] of Object.entries(defaults)) {
    if (defValue && typeof defValue === 'object' && !Array.isArray(defValue)) {
      result[key] = { ...defValue, ...(current?.[key] || {}) };
    } else if (!(key in result)) {
      result[key] = defValue;
    }
  }
  return result;
}
