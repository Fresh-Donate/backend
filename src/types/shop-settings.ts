import type { OwnerType } from '@/models/shop-settings.model';
import type { CurrencyRates, SupportedCurrency } from '@/utils/currency';

export type ShopFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'
  | 'url'
  | 'email'
  | 'date'
  | 'datetime'
  | 'image'
  | 'file'
  | 'list';

export type ShopFieldPrimitive = string | number | boolean | null;
export type ShopFieldValue = ShopFieldPrimitive | string[] | ShopFieldItem[];
export type ShopFieldItem = { [key: string]: ShopFieldValue };
export type ShopFieldValues = { [key: string]: ShopFieldValue };

export interface ShopFieldOption {
  value: string;
  label: string;
}

export interface ShopFieldCondition {
  key: string;
  equals: ShopFieldPrimitive | ShopFieldPrimitive[];
}

export interface ShopField {
  key: string;
  type: ShopFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  icon?: string;
  required?: boolean;
  default?: ShopFieldValue;
  visibleIf?: ShopFieldCondition;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  pattern?: string;
  rows?: number;
  options?: ShopFieldOption[];
  multiple?: boolean;
  format?: 'hex' | 'tailwind';
  accept?: string;
  fields?: ShopField[];
  addLabel?: string;
  titleKey?: string;
}

export interface ShopFieldGroup {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  fields: ShopField[];
}

export interface ShopSettingsSchema {
  version: 1;
  groups: ShopFieldGroup[];
}

export interface ShopSettingsDto {
  shopUrl: string;
  fields: ShopFieldValues;
  name: string;
  ip: string;
  contactEmail: string;
  cartEnabled: boolean;
  baseCurrency: SupportedCurrency;
  currencyRates: CurrencyRates;
  /** @deprecated Read `fields.description`. Removed in the next release. */
  description: string;
  /** @deprecated Read `fields.color`. Removed in the next release. */
  color: string;
  /** @deprecated Read `fields.ownerName`. Removed in the next release. */
  ownerName: string;
  /** @deprecated Read `fields.ownerType`. Removed in the next release. */
  ownerType: OwnerType;
  /** @deprecated Read `fields.ownerInn`. Removed in the next release. */
  ownerInn: string;
}

/** @deprecated Flat keys sent by panels older than the schema-driven settings page. */
export interface LegacyShopSettingsInput {
  name?: string;
  description?: string;
  color?: string;
  ip?: string;
  ownerName?: string;
  ownerType?: OwnerType;
  ownerInn?: string;
  contactEmail?: string;
  cartEnabled?: boolean;
}

export interface ShopSettingsUpdateDto extends LegacyShopSettingsInput {
  shopUrl?: string;
  fields?: unknown;
  schema?: unknown;
}

export interface StoredFile {
  relativePath: string;
  name: string;
  bytes: number;
  mimeType: string;
}
