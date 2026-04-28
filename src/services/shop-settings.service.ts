import { ShopSettings, CurrencyRates } from '@/models/shop-settings.model';

export interface ShopSettingsDto {
  name: string;
  description: string;
  color: string;
  ip: string;
  shopUrl: string;
  currencyRates: CurrencyRates;
}

const DEFAULTS = {
  name: 'FreshDonate Shop',
  description: '',
  color: 'sky',
  ip: 'play.example.com',
  shopUrl: 'http://localhost:3002',
  currencyRates: { USD: 95, EUR: 100 } as CurrencyRates,
};

/** Strip trailing slashes from a URL — keeps canonical URLs consistent. */
function normalizeShopUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  return url.replace(/\/+$/, '');
}

/**
 * Validate, normalise and trim a partial currency-rates patch. RUB is the
 * implicit anchor (always 1) and is rejected if supplied. Empty or non-positive
 * rates are dropped so the admin can effectively "remove" a currency by
 * clearing its field.
 */
function normalizeCurrencyRates(rates: CurrencyRates | undefined): CurrencyRates | undefined {
  if (rates === undefined) return undefined;
  const out: CurrencyRates = {};
  for (const [code, rate] of Object.entries(rates)) {
    const upper = code.toUpperCase();
    if (upper === 'RUB') continue;
    if (!/^[A-Z]{3,8}$/.test(upper)) continue;
    const numeric = Number(rate);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    out[upper] = numeric;
  }
  return out;
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

    return {
      name: settings.name,
      description: settings.description,
      color: settings.color,
      ip: settings.ip,
      shopUrl: settings.shopUrl,
      currencyRates: settings.currencyRates ?? {},
    };
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
      currencyRates: normalizeCurrencyRates(data.currencyRates),
    };

    await settings.update(patch);

    return {
      name: settings.name,
      description: settings.description,
      color: settings.color,
      ip: settings.ip,
      shopUrl: settings.shopUrl,
      currencyRates: settings.currencyRates ?? {},
    };
  }
}
