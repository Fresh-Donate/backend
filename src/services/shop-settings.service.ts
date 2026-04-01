import { ShopSettings } from '../models/shop-settings.model';

export interface ShopSettingsDto {
  name: string;
  description: string;
  color: string;
}

export class ShopSettingsService {
  /**
   * Get settings (singleton — always returns first row or creates default)
   */
  async get(): Promise<ShopSettingsDto> {
    const [settings] = await ShopSettings.findOrCreate({
      where: {},
      defaults: {
        name: 'FreshDonate Shop',
        description: '',
        color: 'sky',
      },
    });

    return {
      name: settings.name,
      description: settings.description,
      color: settings.color,
    };
  }

  /**
   * Update settings (singleton — updates first row or creates it)
   */
  async update(data: Partial<ShopSettingsDto>): Promise<ShopSettingsDto> {
    const [settings] = await ShopSettings.findOrCreate({
      where: {},
      defaults: {
        name: 'FreshDonate Shop',
        description: '',
        color: 'sky',
      },
    });

    await settings.update(data);

    return {
      name: settings.name,
      description: settings.description,
      color: settings.color,
    };
  }
}
