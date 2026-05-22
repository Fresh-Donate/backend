import { ShopSettings, type OwnerType } from '@/models/shop-settings.model';
import { SettingsService } from '@/services/settings.service';
import type { ShopSettingsDto } from '@/types';

const OWNER_TYPES: readonly OwnerType[] = ['', 'individual', 'self_employed', 'sole_proprietor', 'legal_entity'] as const;

const DEFAULTS = {
  name: 'FreshDonate Shop',
  description: '',
  color: 'sky',
  ip: 'play.example.com',
  shopUrl: 'http://localhost:3002',
  ownerName: '',
  ownerType: '' as OwnerType,
  ownerInn: '',
  contactEmail: '',
};

function normalizeShopUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  return url.replace(/\/+$/, '');
}

// Drop unknown owner-type strings to '' so a stale enum value from the panel
// can't make legal pages render a garbage label.
function normalizeOwnerType(value: OwnerType | string | undefined): OwnerType | undefined {
  if (value === undefined) return undefined;
  return (OWNER_TYPES as readonly string[]).includes(value) ? (value as OwnerType) : '';
}

function normalizeInn(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(/\D/g, '').slice(0, 12);
}

function toDto(
  s: ShopSettings,
  currency: Pick<Awaited<ReturnType<SettingsService['get']>>, 'base_currency' | 'currency_rates'>,
): ShopSettingsDto {
  return {
    name: s.name,
    description: s.description,
    color: s.color,
    ip: s.ip,
    shopUrl: s.shopUrl,
    ownerName: s.ownerName ?? '',
    ownerType: ((OWNER_TYPES as readonly string[]).includes(s.ownerType) ? s.ownerType : '') as OwnerType,
    ownerInn: s.ownerInn ?? '',
    contactEmail: s.contactEmail ?? '',
    baseCurrency: currency.base_currency,
    currencyRates: currency.currency_rates,
  };
}

export class ShopSettingsService {
  private settingsService = new SettingsService();

  async get(): Promise<ShopSettingsDto> {
    const [settings] = await ShopSettings.findOrCreate({
      where: {},
      defaults: DEFAULTS,
    });

    const currency = await this.settingsService.get();
    return toDto(settings, currency);
  }

  async update(data: Partial<ShopSettingsDto>): Promise<ShopSettingsDto> {
    const [settings] = await ShopSettings.findOrCreate({
      where: {},
      defaults: DEFAULTS,
    });

    const patch: Partial<ShopSettingsDto> = {
      ...data,
      shopUrl: normalizeShopUrl(data.shopUrl),
      ownerType: normalizeOwnerType(data.ownerType),
      ownerInn: normalizeInn(data.ownerInn),
    };

    await settings.update(patch);

    const currency = await this.settingsService.get();
    return toDto(settings, currency);
  }
}
