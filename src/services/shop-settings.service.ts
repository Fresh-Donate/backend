import { ShopSettings, type OwnerType } from '@/models/shop-settings.model';

const OWNER_TYPES: readonly OwnerType[] = ['', 'individual', 'self_employed', 'sole_proprietor', 'legal_entity'] as const;

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
}

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

/** Strip trailing slashes from a URL — keeps canonical URLs consistent. */
function normalizeShopUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  return url.replace(/\/+$/, '');
}

/**
 * Drop unknown owner-type strings to '' — if the panel sends a stale enum
 * value the legal pages would otherwise render a garbage label.
 */
function normalizeOwnerType(value: OwnerType | string | undefined): OwnerType | undefined {
  if (value === undefined) return undefined;
  return (OWNER_TYPES as readonly string[]).includes(value) ? (value as OwnerType) : '';
}

/** Keep only digits — INN is numeric (10 or 12 digits), defensive trim. */
function normalizeInn(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(/\D/g, '').slice(0, 12);
}

function toDto(s: ShopSettings): ShopSettingsDto {
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
  };
}

export class ShopSettingsService {
  /**
   * Get settings (singleton — always returns first row or creates default)
   */
  async get(): Promise<ShopSettingsDto> {
    const [settings] = await ShopSettings.findOrCreate({
      where: {},
      defaults: DEFAULTS,
    });

    return toDto(settings);
  }

  /**
   * Update settings (singleton — updates first row or creates it)
   */
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

    return toDto(settings);
  }
}
