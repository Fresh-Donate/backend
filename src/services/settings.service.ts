import crypto from 'crypto';
import { Settings, type DeliveryMethod } from '@/models/settings.model';

export interface SettingsDto {
  demo_payments: boolean;
  delivery_method: DeliveryMethod;
  rcon_config: {
    host: string;
    port: number;
    password: string;
  };
  plugin_config: {
    token: string;
  };
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex').slice(0, 32);
}

function toDto(s: Settings): SettingsDto {
  return {
    demo_payments: s.demo_payments,
    delivery_method: s.delivery_method,
    rcon_config: s.rcon_config,
    plugin_config: s.plugin_config,
  };
}

export class SettingsService {
  async get(): Promise<SettingsDto> {
    const [settings] = await Settings.findOrCreate({
      where: {},
      defaults: {
        demo_payments: false,
        delivery_method: 'rcon',
        rcon_config: { host: '', port: 25575, password: '' },
        plugin_config: { token: generateToken() },
      },
    });

    return toDto(settings);
  }

  async update(data: Partial<SettingsDto>): Promise<SettingsDto> {
    const [settings] = await Settings.findOrCreate({
      where: {},
      defaults: {
        demo_payments: false,
        delivery_method: 'rcon',
        rcon_config: { host: '', port: 25575, password: '' },
        plugin_config: { token: generateToken() },
      },
    });

    await settings.update(data);

    return toDto(settings);
  }
}
