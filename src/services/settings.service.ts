import crypto from 'crypto';
import { Settings } from '@/models/settings.model';
import {
  SUPPORTED_CURRENCIES,
  DEFAULT_BASE_CURRENCY,
  defaultRatesFor,
  isSupportedCurrency,
  type CurrencyRates,
  type SupportedCurrency,
} from '@/utils/currency';
import type { SettingsDto } from '@/types';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex').slice(0, 32);
}

// Drop unsupported codes / non-positive numbers / the base currency itself.
// Mirrors the panel's fixed RUB/USD/EUR allow-list — silently ignoring stale
// keys keeps a partial PUT from a stale client from failing.
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

// Always emit a populated rate map for the two non-base currencies so the
// panel never has to decide what to render for an empty cell — missing
// entries are filled with defaults.
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
    // base. Replace with defaults rather than try to migrate.
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
