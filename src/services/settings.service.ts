import crypto from 'crypto';
import {
  Settings,
  DEFAULT_SMTP_CONFIG,
  DEFAULT_RECEIPT_TEMPLATE,
} from '@/models/settings.model';
import { PaymentProvider } from '@/models/payment-provider.model';
import { ValidationError } from '@/core';
import {
  SUPPORTED_CURRENCIES,
  DEFAULT_BASE_CURRENCY,
  defaultRatesFor,
  isSupportedCurrency,
  convert,
  type CurrencyRates,
  type SupportedCurrency,
} from '@/utils/currency';
import type { SettingsDto, SmtpConfig, ReceiptTemplate } from '@/types';
import { MIN_AMOUNT_LOWER, MIN_AMOUNT_UPPER } from '@/types/payment-provider';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex').slice(0, 32);
}

function generateInstallationId(): string {
  return crypto.randomUUID();
}

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

function fillSmtpConfig(stored: Partial<SmtpConfig> | null | undefined): SmtpConfig {
  const s = stored ?? {};
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SMTP_CONFIG.enabled,
    host: typeof s.host === 'string' ? s.host : DEFAULT_SMTP_CONFIG.host,
    port: Number.isFinite(Number(s.port)) ? Number(s.port) : DEFAULT_SMTP_CONFIG.port,
    secure: typeof s.secure === 'boolean' ? s.secure : DEFAULT_SMTP_CONFIG.secure,
    user: typeof s.user === 'string' ? s.user : DEFAULT_SMTP_CONFIG.user,
    password: typeof s.password === 'string' ? s.password : DEFAULT_SMTP_CONFIG.password,
    fromEmail: typeof s.fromEmail === 'string' ? s.fromEmail : DEFAULT_SMTP_CONFIG.fromEmail,
    fromName: typeof s.fromName === 'string' ? s.fromName : DEFAULT_SMTP_CONFIG.fromName,
  };
}

function fillReceiptTemplate(stored: Partial<ReceiptTemplate> | null | undefined): ReceiptTemplate {
  const t = stored ?? {};
  return {
    subject: typeof t.subject === 'string' && t.subject.trim() ? t.subject : DEFAULT_RECEIPT_TEMPLATE.subject,
    html: typeof t.html === 'string' && t.html.trim() ? t.html : DEFAULT_RECEIPT_TEMPLATE.html,
  };
}

function normalizeSmtpPatch(patch: Partial<SmtpConfig> | undefined, current: SmtpConfig): SmtpConfig | undefined {
  if (patch === undefined) return undefined;
  const port = patch.port !== undefined ? Number(patch.port) : current.port;
  const safePort = Number.isFinite(port) && port > 0 && port < 65536 ? Math.floor(port) : current.port;
  return {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    host: typeof patch.host === 'string' ? patch.host.trim().slice(0, 256) : current.host,
    port: safePort,
    secure: typeof patch.secure === 'boolean' ? patch.secure : current.secure,
    user: typeof patch.user === 'string' ? patch.user.slice(0, 256) : current.user,
    password: typeof patch.password === 'string' ? patch.password.slice(0, 512) : current.password,
    fromEmail: typeof patch.fromEmail === 'string' ? patch.fromEmail.trim().slice(0, 256) : current.fromEmail,
    fromName: typeof patch.fromName === 'string' ? patch.fromName.trim().slice(0, 128) : current.fromName,
  };
}

function normalizeReceiptPatch(patch: Partial<ReceiptTemplate> | undefined, current: ReceiptTemplate): ReceiptTemplate | undefined {
  if (patch === undefined) return undefined;
  return {
    subject: typeof patch.subject === 'string' ? patch.subject.slice(0, 512) : current.subject,
    html: typeof patch.html === 'string' ? patch.html.slice(0, 100000) : current.html,
  };
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
    multi_server_enabled: s.multi_server_enabled ?? false,
    base_currency: base,
    currency_rates: fillRatesForBase(s.currency_rates, base),
    telemetry_enabled: s.telemetry_enabled ?? true,
    installation_id: s.installation_id,
    smtp_config: fillSmtpConfig(s.smtp_config),
    receipt_template: fillReceiptTemplate(s.receipt_template),
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
        telemetry_enabled: true,
        installation_id: generateInstallationId(),
        smtp_config: DEFAULT_SMTP_CONFIG,
        receipt_template: DEFAULT_RECEIPT_TEMPLATE,
      },
    });

    if (!settings.installation_id) {
      await settings.update({ installation_id: generateInstallationId() });
    }

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
        telemetry_enabled: true,
        installation_id: generateInstallationId(),
        smtp_config: DEFAULT_SMTP_CONFIG,
        receipt_template: DEFAULT_RECEIPT_TEMPLATE,
      },
    });

    if (!settings.installation_id) {
      await settings.update({ installation_id: generateInstallationId() });
    }

    // Multi-server only works with the plugin delivery method (RCON has no
    // per-server routing). Block toggling either knob into an inconsistent
    // state — the panel mirrors this constraint, but enforce server-side too.
    const currentMulti = settings.multi_server_enabled ?? false;
    const nextMulti = data.multi_server_enabled ?? currentMulti;
    const currentDelivery = settings.delivery_method;
    const nextDelivery = data.delivery_method ?? currentDelivery;
    if (nextMulti && nextDelivery !== 'plugin') {
      throw new ValidationError('Multi-server requires delivery_method=plugin');
    }

    const currentBase: SupportedCurrency = isSupportedCurrency(settings.base_currency)
      ? settings.base_currency
      : DEFAULT_BASE_CURRENCY;

    const ratesBeforeUpdate: CurrencyRates = fillRatesForBase(settings.currency_rates, currentBase);
    const requestedBase = data.base_currency;
    const nextBase: SupportedCurrency =
      requestedBase !== undefined && isSupportedCurrency(requestedBase) ? requestedBase : currentBase;
    const baseChanged = nextBase !== currentBase;

    const startingRates = baseChanged ? defaultRatesFor(nextBase) : (settings.currency_rates ?? {});
    const patchRates = normalizeCurrencyRates(data.currency_rates, nextBase);
    const nextRates = patchRates ? { ...startingRates, ...patchRates } : startingRates;

    const currentSmtp = fillSmtpConfig(settings.smtp_config);
    const currentReceipt = fillReceiptTemplate(settings.receipt_template);
    const nextSmtp = normalizeSmtpPatch(data.smtp_config, currentSmtp);
    const nextReceipt = normalizeReceiptPatch(data.receipt_template, currentReceipt);

    const patch: Partial<SettingsDto> = {
      ...data,
      base_currency: nextBase,
      currency_rates: nextRates,
    };

    if (nextSmtp) patch.smtp_config = nextSmtp;
    else delete patch.smtp_config;

    if (nextReceipt) patch.receipt_template = nextReceipt;
    else delete patch.receipt_template;

    delete patch.installation_id;

    await settings.update(patch);

    if (baseChanged) {
      await rebaseProviderMinAmounts(currentBase, nextBase, ratesBeforeUpdate);
    }

    return toDto(settings);
  }
}

async function rebaseProviderMinAmounts(
  oldBase: SupportedCurrency,
  newBase: SupportedCurrency,
  oldRates: CurrencyRates,
): Promise<void> {
  const providers = await PaymentProvider.findAll();
  for (const provider of providers) {
    const current = Number(provider.minAmount);
    if (!Number.isFinite(current) || current <= 0) continue;
    const converted = convert(current, oldBase, newBase, oldRates, oldBase);
    const rounded = Math.round(converted * 100) / 100;
    const clamped = Math.min(MIN_AMOUNT_UPPER, Math.max(MIN_AMOUNT_LOWER, rounded));
    if (clamped !== current) {
      await provider.update({ minAmount: clamped });
    }
  }
}
