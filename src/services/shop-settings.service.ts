import { ShopSettings, type OwnerType } from '@/models/shop-settings.model';
import { SettingsService } from '@/services/settings.service';
import { ValidationError } from '@/core';
import { findShopField, parseShopSchema, validateShopFields } from '@/utils/shop-fields';
import type {
  LegacyShopSettingsInput,
  ShopFieldValue,
  ShopFieldValues,
  ShopSettingsDto,
  ShopSettingsSchema,
  ShopSettingsUpdateDto,
} from '@/types';

const OWNER_TYPES: readonly OwnerType[] = ['', 'individual', 'self_employed', 'sole_proprietor', 'legal_entity'] as const;

const FIELD_DEFAULTS = {
  name: 'FreshDonate Shop',
  description: '',
  color: 'sky',
  ip: 'play.example.com',
  ownerName: '',
  ownerType: '',
  ownerInn: '',
  contactEmail: '',
  cartEnabled: false,
};

const LEGACY_KEYS = Object.keys(FIELD_DEFAULTS) as (keyof LegacyShopSettingsInput)[];

const LEGACY_COLUMN_LENGTH: Record<Exclude<keyof LegacyShopSettingsInput, 'cartEnabled'>, number> = {
  name: 64,
  description: 500,
  color: 32,
  ip: 64,
  ownerName: 256,
  ownerType: 32,
  ownerInn: 32,
  contactEmail: 256,
};

function normalizeShopUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  return url.replace(/\/+$/, '');
}

function normalizeOwnerType(value: string): OwnerType {
  return (OWNER_TYPES as readonly string[]).includes(value) ? (value as OwnerType) : '';
}

function pickLegacy(data: LegacyShopSettingsInput): ShopFieldValues {
  const out: ShopFieldValues = {};
  for (const key of LEGACY_KEYS) {
    const value = data[key];
    if (value === undefined) continue;
    if (key === 'ownerType') out[key] = normalizeOwnerType(String(value));
    else if (key === 'ownerInn') out[key] = String(value).replace(/\D/g, '').slice(0, 12);
    else out[key] = value;
  }
  return out;
}

function legacyColumns(fields: ShopFieldValues): Partial<ShopSettings> {
  const out: Record<string, string | boolean> = {};
  for (const [key, length] of Object.entries(LEGACY_COLUMN_LENGTH)) {
    const value = fields[key];
    if (typeof value === 'string') out[key] = value.slice(0, length);
  }
  if (typeof fields.cartEnabled === 'boolean') out.cartEnabled = fields.cartEnabled;
  return out as Partial<ShopSettings>;
}

function resolveValue(fields: ShopFieldValues, schema: ShopSettingsSchema | null, key: string): ShopFieldValue | undefined {
  return fields[key] !== undefined ? fields[key] : findShopField(schema, key)?.default;
}

function resolveString(fields: ShopFieldValues, schema: ShopSettingsSchema | null, key: keyof typeof FIELD_DEFAULTS): string {
  const value = resolveValue(fields, schema, key);
  return typeof value === 'string' ? value : String(FIELD_DEFAULTS[key]);
}

function toDto(
  s: ShopSettings,
  currency: Pick<Awaited<ReturnType<SettingsService['get']>>, 'base_currency' | 'currency_rates'>,
): ShopSettingsDto {
  const fields = s.fields ?? {};
  const schema = s.fieldsSchema ?? null;
  const cartEnabled = resolveValue(fields, schema, 'cartEnabled');

  return {
    shopUrl: s.shopUrl,
    fields,
    name: resolveString(fields, schema, 'name'),
    ip: resolveString(fields, schema, 'ip'),
    contactEmail: resolveString(fields, schema, 'contactEmail'),
    cartEnabled: typeof cartEnabled === 'boolean' ? cartEnabled : FIELD_DEFAULTS.cartEnabled,
    baseCurrency: currency.base_currency,
    currencyRates: currency.currency_rates,
    description: resolveString(fields, schema, 'description'),
    color: resolveString(fields, schema, 'color'),
    ownerName: resolveString(fields, schema, 'ownerName'),
    ownerType: normalizeOwnerType(resolveString(fields, schema, 'ownerType')),
    ownerInn: resolveString(fields, schema, 'ownerInn'),
  };
}

export class ShopSettingsService {
  private settingsService = new SettingsService();

  private async load(): Promise<ShopSettings> {
    const [settings] = await ShopSettings.findOrCreate({
      where: {},
      defaults: { fields: {} },
    });
    return settings;
  }

  async get(): Promise<ShopSettingsDto> {
    const settings = await this.load();
    const currency = await this.settingsService.get();
    return toDto(settings, currency);
  }

  async getSchema(): Promise<ShopSettingsSchema | null> {
    const settings = await this.load();
    return settings.fieldsSchema ?? null;
  }

  async update(data: ShopSettingsUpdateDto): Promise<ShopSettingsDto> {
    const settings = await this.load();

    const schema = data.schema !== undefined ? parseShopSchema(data.schema) : settings.fieldsSchema ?? null;
    const fields: ShopFieldValues = { ...(settings.fields ?? {}), ...pickLegacy(data) };

    if (data.fields !== undefined) {
      if (!schema) throw new ValidationError('Нет схемы магазина: передайте schema вместе с fields.');
      Object.assign(fields, validateShopFields(schema, data.fields));
    }

    await settings.update({
      ...(data.shopUrl !== undefined ? { shopUrl: normalizeShopUrl(data.shopUrl) } : {}),
      ...(data.schema !== undefined ? { fieldsSchema: schema } : {}),
      fields,
      ...legacyColumns(fields),
    });

    const currency = await this.settingsService.get();
    return toDto(settings, currency);
  }
}
