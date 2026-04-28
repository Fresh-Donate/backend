import crypto from 'crypto';
import { Settings, type DeliveryMethod } from '@/models/settings.model';
import type { CurrencyRates } from '@/utils/currency';

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
  currency_rates: CurrencyRates;
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex').slice(0, 32);
}

const DEFAULT_RATES: CurrencyRates = { USD: 95, EUR: 100 };

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

function toDto(s: Settings): SettingsDto {
  return {
    demo_payments: s.demo_payments,
    delivery_method: s.delivery_method,
    rcon_config: s.rcon_config,
    plugin_config: s.plugin_config,
    currency_rates: s.currency_rates ?? {},
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
        currency_rates: DEFAULT_RATES,
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
        currency_rates: DEFAULT_RATES,
      },
    });

    const patch: Partial<SettingsDto> = {
      ...data,
      currency_rates: normalizeCurrencyRates(data.currency_rates),
    };

    await settings.update(patch);

    return toDto(settings);
  }
}
