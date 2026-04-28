import { ShopSettings } from '@/models/shop-settings.model';

export interface ShopSettingsDto {
  name: string;
  description: string;
  color: string;
  ip: string;
  shopUrl: string;
}

const DEFAULTS = {
  name: 'FreshDonate Shop',
  description: '',
  color: 'sky',
  ip: 'play.example.com',
  shopUrl: 'http://localhost:3002',
};

/** Strip trailing slashes from a URL — keeps canonical URLs consistent. */
function normalizeShopUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  return url.replace(/\/+$/, '');
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

    const patch = {
      ...data,
      shopUrl: normalizeShopUrl(data.shopUrl),
    };

    await settings.update(patch);

    return {
      name: settings.name,
      description: settings.description,
      color: settings.color,
      ip: settings.ip,
      shopUrl: settings.shopUrl,
    };
  }
}
