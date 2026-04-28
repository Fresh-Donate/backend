import crypto from 'crypto';
import { Settings, type DeliveryMethod } from '@/models/settings.model';
import {
  SUPPORTED_CURRENCIES,
  DEFAULT_BASE_CURRENCY,
  defaultRatesFor,
  isSupportedCurrency,
  type CurrencyRates,
  type SupportedCurrency,
} from '@/utils/currency';

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
  base_currency: SupportedCurrency;
  currency_rates: CurrencyRates;
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex').slice(0, 32);
}

/**
 * Drop unsupported codes, the base currency itself, and non-positive numbers.
 * Mirrors the panel's fixed RUB/USD/EUR allow-list — anything else is dropped
 * silently rather than rejected, so a partial update from a stale client
 * doesn't fail the whole PUT.
 */
function normalizeCurrencyRates(rates: CurrencyRates | undefined, base: SupportedCurrency): CurrencyRates | undefined {
  if (rates === undefined) return undefined;
  const out: CurrencyRates = {};
  for (const [code, rate] of Object.entries(rates)) {
    const upper = code.toUpperCase();
    if (!isSupportedCurrency(upper)) continue;
    if (upper === base) continue;
    const numeric = Number(rate);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    out[upper] = numeric;
  }
  return out;
}

/**
 * Always emit a populated rate map for the two non-base currencies, even if
 * the stored row is partial or has stale codes left over from before a base
 * switch. Missing entries are filled with defaults so the panel never has to
 * decide what to render for an empty cell.
 */
function fillRatesForBase(stored: CurrencyRates | null | undefined, base: SupportedCurrency): CurrencyRates {
  const raw = stored ?? {};
  const defaults = defaultRatesFor(base);
  const out: CurrencyRates = {};
  for (const code of SUPPORTED_CURRENCIES) {
    if (code === base) continue;
    const candidate = Number(raw[code]);
    out[code] = Number.isFinite(candidate) && candidate > 0 ? candidate : defaults[code];
  }
  return out;
}

function toDto(s: Settings): SettingsDto {
  const base: SupportedCurrency = isSupportedCurrency(s.base_currency)
    ? s.base_currency
    : DEFAULT_BASE_CURRENCY;
  return {
    demo_payments: s.demo_payments,
    delivery_method: s.delivery_method,
    rcon_config: s.rcon_config,
    plugin_config: s.plugin_config,
    base_currency: base,
    currency_rates: fillRatesForBase(s.currency_rates, base),
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
        base_currency: DEFAULT_BASE_CURRENCY,
        currency_rates: defaultRatesFor(DEFAULT_BASE_CURRENCY),
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
        base_currency: DEFAULT_BASE_CURRENCY,
        currency_rates: defaultRatesFor(DEFAULT_BASE_CURRENCY),
      },
    });

    const currentBase: SupportedCurrency = isSupportedCurrency(settings.base_currency)
      ? settings.base_currency
      : DEFAULT_BASE_CURRENCY;
    const requestedBase = data.base_currency;
    const nextBase: SupportedCurrency =
      requestedBase !== undefined && isSupportedCurrency(requestedBase) ? requestedBase : currentBase;
    const baseChanged = nextBase !== currentBase;

    // Old rates are "X per 1 unit of OLD_BASE" — meaningless under the new
    // base. Don't try to migrate them; replace with sensible defaults so the
    // admin can adjust from a known-good starting point.
    const startingRates = baseChanged ? defaultRatesFor(nextBase) : (settings.currency_rates ?? {});
    const patchRates = normalizeCurrencyRates(data.currency_rates, nextBase);
    const nextRates = patchRates ? { ...startingRates, ...patchRates } : startingRates;

    const patch: Partial<SettingsDto> = {
      ...data,
      base_currency: nextBase,
      currency_rates: nextRates,
    };

    await settings.update(patch);

    return toDto(settings);
  }
}
