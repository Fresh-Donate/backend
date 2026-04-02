import { Settings } from '../models/settings.model';

export interface SettingsDto {
  demo_payments: boolean;
}

export class SettingsService {
  /**
   * Get settings (singleton — always returns first row or creates default)
   */
  async get(): Promise<SettingsDto> {
    const [settings] = await Settings.findOrCreate({
      where: {},
      defaults: {
        demo_payments: false
      },
    });

    return {
      demo_payments: settings.demo_payments
    };
  }

  /**
   * Update settings (singleton — updates first row or creates it)
   */
  async update(data: Partial<SettingsDto>): Promise<SettingsDto> {
    const [settings] = await Settings.findOrCreate({
      where: {},
      defaults: {
        demo_payments: false
      },
    });

    await settings.update(data);

    return {
      demo_payments: settings.demo_payments
    };
  }
}
