import type { OwnerType } from '@/models/shop-settings.model';
import type { CurrencyRates, SupportedCurrency } from '@/utils/currency';

export interface ShopSettingsDto {
  name: string;
  description: string;
  color: string;
  ip: string;
  shopUrl: string;
  ownerName: string;
  ownerType: OwnerType;
  ownerInn: string;
  contactEmail: string;
  cartEnabled: boolean;
  baseCurrency: SupportedCurrency;
  currencyRates: CurrencyRates;
}
