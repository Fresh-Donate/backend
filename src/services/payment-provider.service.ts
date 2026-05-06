import { PaymentProvider } from '@/models/payment-provider.model';
import { NotFoundError } from '@/core';
import type { PaymentProviderDto, UpdatePaymentProviderDto } from '@/types';

const DEFAULT_PROVIDERS: Array<{
  providerId: string;
  name: string;
  description: string;
  icon: string;
  credentials: Record<string, string>;
  commissionPercent: number;
  supportedCurrencies: string[];
}> = [
  {
    providerId: 'yookassa',
    name: 'ЮKassa',
    description: 'Приём платежей для РФ: банковские карты, СБП, ЮMoney, SberPay, T-Pay',
    icon: 'i-lucide-credit-card',
    credentials: { shopId: '', secretKey: '' },
    commissionPercent: 2.8,
    supportedCurrencies: ['RUB'],
  },
  {
    providerId: 'heleket',
    name: 'Heleket',
    description: 'Криптовалютные платежи: BTC, ETH, USDT и другие',
    icon: 'i-lucide-bitcoin',
    credentials: { apiKey: '', merchantId: '' },
    commissionPercent: 0.5,
    supportedCurrencies: ['USD', 'EUR', 'RUB'],
  },
  {
    providerId: 'wata',
    name: 'Wata',
    description: 'Приём платежей: банковские карты, СБП. Поддерживает песочницу.',
    icon: 'i-lucide-wallet',
    credentials: { apiKey: '' },
    commissionPercent: 2.5,
    supportedCurrencies: ['RUB', 'USD', 'EUR'],
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
    commissionPercent: Number(p.commissionPercent),
    commissionRule: p.commissionRule,
    supportedCurrencies: p.supportedCurrencies,
  };
}

export class PaymentProviderService {
  private seeded = false;

  // Idempotent per-provider seed: missing providers are inserted, existing ones
  // left alone. Lets new providers (e.g. wata after an upgrade) appear on an
  // already-seeded installation without manual migration.
  private async seed(): Promise<void> {
    if (this.seeded) return;

    const existing = await PaymentProvider.findAll({ attributes: ['providerId'] });
    const existingIds = new Set(existing.map((p) => p.providerId));

    for (const def of DEFAULT_PROVIDERS) {
      if (existingIds.has(def.providerId)) continue;
      await PaymentProvider.create({
        ...def,
        commissionRule: { mode: 'seller' },
      });
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
