import { PaymentProvider, type PaymentMethodData, type CommissionRuleData } from '@/models/payment-provider.model';
import { NotFoundError } from '@/core';

export interface PaymentProviderDto {
  id: string;
  providerId: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  credentials: Record<string, string>;
  methods: PaymentMethodData[];
  commissionRule: CommissionRuleData;
  supportedCurrencies: string[];
}

export interface UpdatePaymentProviderDto {
  enabled?: boolean;
  credentials?: Record<string, string>;
  methods?: PaymentMethodData[];
  commissionRule?: CommissionRuleData;
}

/** Default provider definitions — seeded on first request */
const DEFAULT_PROVIDERS: Array<{
  providerId: string;
  name: string;
  description: string;
  icon: string;
  credentials: Record<string, string>;
  methods: PaymentMethodData[];
  supportedCurrencies: string[];
}> = [
  {
    providerId: 'yookassa',
    name: 'ЮKassa',
    description: 'Приём платежей для РФ: банковские карты, СБП, ЮMoney, SberPay, T-Pay',
    icon: 'i-lucide-credit-card',
    credentials: { shopId: '', secretKey: '' },
    methods: [
      { id: 'bank_card', name: 'Банковские карты', commission: 2.8, enabled: true },
      { id: 'sbp', name: 'СБП', commission: 0.4, enabled: true },
      { id: 'yoo_money', name: 'ЮMoney', commission: 3.0, enabled: true },
      { id: 'sber_pay', name: 'SberPay', commission: 2.8, enabled: false },
      { id: 't_pay', name: 'T-Pay', commission: 2.8, enabled: false },
      { id: 'qiwi', name: 'QIWI', commission: 6.0, enabled: false },
    ],
    supportedCurrencies: ['RUB'],
  },
  {
    providerId: 'heleket',
    name: 'Heleket',
    description: 'Криптовалютные платежи: BTC, ETH, USDT и другие',
    icon: 'i-lucide-bitcoin',
    credentials: { apiKey: '', merchantId: '' },
    methods: [
      { id: 'btc', name: 'Bitcoin (BTC)', commission: 0.5, enabled: true },
      { id: 'eth', name: 'Ethereum (ETH)', commission: 0.5, enabled: true },
      { id: 'usdt_trc20', name: 'USDT (TRC-20)', commission: 0.5, enabled: true },
      { id: 'usdt_erc20', name: 'USDT (ERC-20)', commission: 0.5, enabled: false },
      { id: 'ltc', name: 'Litecoin (LTC)', commission: 0.5, enabled: false },
      { id: 'trx', name: 'TRON (TRX)', commission: 0.5, enabled: false },
    ],
    supportedCurrencies: ['USD', 'EUR', 'RUB'],
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
    credentials: p.credentials,
    methods: p.methods,
    commissionRule: p.commissionRule,
    supportedCurrencies: p.supportedCurrencies,
  };
}

export class PaymentProviderService {
  private seeded = false;

  /** Seed default providers if table is empty */
  private async seed(): Promise<void> {
    if (this.seeded) return;

    const count = await PaymentProvider.count();
    if (count === 0) {
      for (const def of DEFAULT_PROVIDERS) {
        await PaymentProvider.create({
          ...def,
          commissionRule: { mode: 'seller' },
        });
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
