import { ValidationError } from '@/core';
import type {
  ShopField,
  ShopFieldCondition,
  ShopFieldGroup,
  ShopFieldItem,
  ShopFieldOption,
  ShopFieldPrimitive,
  ShopFieldType,
  ShopFieldValue,
  ShopFieldValues,
  ShopSettingsSchema,
} from '@/types';

export const SHOP_FIELD_TYPES: readonly ShopFieldType[] = [
  'text', 'textarea', 'number', 'boolean', 'select', 'color', 'url', 'email', 'date', 'datetime', 'image', 'file', 'list',
];

export const RESERVED_FIELD_TYPES: Readonly<Record<string, readonly ShopFieldType[]>> = {
  name: ['text'],
  ip: ['text'],
  contactEmail: ['email', 'text'],
  cartEnabled: ['boolean'],
};

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const TAILWIND_RE = /^[a-z][a-z0-9-]{0,31}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_SCHEMA_BYTES = 128 * 1024;
const MAX_VALUES_BYTES = 256 * 1024;
const MAX_GROUPS = 50;
const MAX_FIELDS = 300;
const MAX_OPTIONS = 200;
const MAX_LIST_ITEMS = 100;
const MAX_TEXT: Record<'text' | 'textarea', number> = { text: 1000, textarea: 20000 };
const MAX_URL = 2048;
const MAX_EMAIL = 256;

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is ShopFieldPrimitive {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? '');
}

function schemaError(path: string, message: string): ValidationError {
  return new ValidationError(`Схема магазина, ${path}: ${message}`);
}

function readString(obj: Obj, prop: string, path: string, max: number, required = false): string | undefined {
  const value = obj[prop];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.length > max || (required && !value)) {
    throw schemaError(`${path}.${prop}`, required ? `обязательная строка до ${max} символов` : `строка до ${max} символов`);
  }
  return value;
}

function readNumber(obj: Obj, prop: string, path: string): number | undefined {
  const value = obj[prop];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw schemaError(`${path}.${prop}`, 'ожидается число');
  return value;
}

function readBoolean(obj: Obj, prop: string, path: string): boolean | undefined {
  const value = obj[prop];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw schemaError(`${path}.${prop}`, 'ожидается true или false');
  return value;
}

function readKey(obj: Obj, prop: string, path: string): string {
  const value = obj[prop];
  if (typeof value !== 'string' || !KEY_RE.test(value)) {
    throw schemaError(`${path}.${prop}`, 'латиница, цифры и _, начинается с буквы, до 64 символов');
  }
  return value;
}

function readOptions(raw: unknown, path: string): ShopFieldOption[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OPTIONS) {
    throw schemaError(path, `от 1 до ${MAX_OPTIONS} вариантов`);
  }
  const seen = new Set<string>();
  return raw.map((option, i) => {
    const optionPath = `${path}[${i}]`;
    if (!isObj(option)) throw schemaError(optionPath, 'ожидается объект { value, label }');
    const value = readString(option, 'value', optionPath, 128, false);
    if (value === undefined) throw schemaError(`${optionPath}.value`, 'ожидается строка');
    if (seen.has(value)) throw schemaError(`${optionPath}.value`, `повторяется "${value}"`);
    seen.add(value);
    return { value, label: readString(option, 'label', optionPath, 128, true) as string };
  });
}

function readCondition(raw: unknown, path: string): ShopFieldCondition | undefined {
  if (raw === undefined) return undefined;
  if (!isObj(raw)) throw schemaError(path, 'ожидается объект { key, equals }');
  const equals = raw.equals;
  const valid = Array.isArray(equals) ? equals.every(isPrimitive) : isPrimitive(equals);
  if (!valid) throw schemaError(`${path}.equals`, 'ожидается значение или массив значений');
  return { key: readKey(raw, 'key', path), equals: equals as ShopFieldCondition['equals'] };
}

function checkVisibleIf(fields: ShopField[], path: string): void {
  const keys = new Set(fields.map((f) => f.key));
  for (const field of fields) {
    if (!field.visibleIf) continue;
    if (field.visibleIf.key === field.key || !keys.has(field.visibleIf.key)) {
      throw schemaError(`${path}.${field.key}.visibleIf.key`, `нет поля "${field.visibleIf.key}" рядом`);
    }
  }
}

function checkUniqueKeys(fields: ShopField[], path: string): void {
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.key)) throw schemaError(path, `ключ "${field.key}" повторяется`);
    seen.add(field.key);
  }
}

function parseField(raw: unknown, path: string, inList: boolean, counter: { count: number }): ShopField {
  if (!isObj(raw)) throw schemaError(path, 'ожидается объект');
  if (++counter.count > MAX_FIELDS) throw schemaError(path, `больше ${MAX_FIELDS} полей`);

  const key = readKey(raw, 'key', path);
  const fieldPath = `${path}(${key})`;
  const type = raw.type as ShopFieldType;
  if (!SHOP_FIELD_TYPES.includes(type)) throw schemaError(`${fieldPath}.type`, `неизвестный тип "${String(raw.type)}"`);
  if (type === 'list' && inList) throw schemaError(`${fieldPath}.type`, 'список внутри списка не поддерживается');

  const field: ShopField = { key, type, label: readString(raw, 'label', fieldPath, 128, true) as string };

  const description = readString(raw, 'description', fieldPath, 1000);
  const placeholder = readString(raw, 'placeholder', fieldPath, 256);
  const icon = readString(raw, 'icon', fieldPath, 64);
  const required = readBoolean(raw, 'required', fieldPath);
  const min = readNumber(raw, 'min', fieldPath);
  const max = readNumber(raw, 'max', fieldPath);
  const step = readNumber(raw, 'step', fieldPath);
  const integer = readBoolean(raw, 'integer', fieldPath);
  const rows = readNumber(raw, 'rows', fieldPath);
  const multiple = readBoolean(raw, 'multiple', fieldPath);
  const accept = readString(raw, 'accept', fieldPath, 256);
  const addLabel = readString(raw, 'addLabel', fieldPath, 64);
  const pattern = readString(raw, 'pattern', fieldPath, 512);
  const visibleIf = readCondition(raw.visibleIf, `${fieldPath}.visibleIf`);

  if (pattern !== undefined) {
    try {
      new RegExp(pattern);
    } catch {
      throw schemaError(`${fieldPath}.pattern`, 'некорректное регулярное выражение');
    }
  }
  if (min !== undefined && max !== undefined && min > max) throw schemaError(fieldPath, 'min больше max');

  Object.assign(field, Object.fromEntries(Object.entries({
    description, placeholder, icon, required, min, max, step, integer, rows, multiple, accept, addLabel, pattern, visibleIf,
  }).filter(([, v]) => v !== undefined)));

  if (type === 'color') {
    const format = raw.format ?? 'hex';
    if (format !== 'hex' && format !== 'tailwind') throw schemaError(`${fieldPath}.format`, 'hex или tailwind');
    field.format = format;
  }

  if (type === 'select') field.options = readOptions(raw.options, `${fieldPath}.options`);

  if (type === 'list') {
    if (!Array.isArray(raw.fields) || raw.fields.length === 0) throw schemaError(`${fieldPath}.fields`, 'нужно хотя бы одно поле');
    const itemFields = raw.fields.map((f, i) => parseField(f, `${fieldPath}.fields[${i}]`, true, counter));
    checkUniqueKeys(itemFields, `${fieldPath}.fields`);
    checkVisibleIf(itemFields, `${fieldPath}.fields`);
    field.fields = itemFields;
    if (raw.titleKey !== undefined) {
      const titleKey = readKey(raw, 'titleKey', fieldPath);
      if (!itemFields.some((f) => f.key === titleKey)) throw schemaError(`${fieldPath}.titleKey`, `нет поля "${titleKey}"`);
      field.titleKey = titleKey;
    }
  }

  if (raw.default !== undefined) {
    field.default = checkValue(field, raw.default, `${fieldPath}.default`, false, schemaError);
  }

  return field;
}

function parseGroup(raw: unknown, path: string, counter: { count: number }): ShopFieldGroup {
  if (!isObj(raw)) throw schemaError(path, 'ожидается объект');
  const id = readKey(raw, 'id', path);
  const groupPath = `${path}(${id})`;
  if (!Array.isArray(raw.fields)) throw schemaError(`${groupPath}.fields`, 'ожидается массив');

  const group: ShopFieldGroup = {
    id,
    label: readString(raw, 'label', groupPath, 128, true) as string,
    fields: raw.fields.map((f, i) => parseField(f, `${groupPath}.fields[${i}]`, false, counter)),
  };
  const description = readString(raw, 'description', groupPath, 1000);
  const icon = readString(raw, 'icon', groupPath, 64);
  if (description !== undefined) group.description = description;
  if (icon !== undefined) group.icon = icon;
  return group;
}

export function parseShopSchema(input: unknown): ShopSettingsSchema {
  if (!isObj(input)) throw schemaError('schema', 'ожидается объект');
  if (byteSize(input) > MAX_SCHEMA_BYTES) throw schemaError('schema', `больше ${MAX_SCHEMA_BYTES / 1024} КБ`);
  if (input.version !== 1) throw schemaError('version', 'поддерживается только версия 1');
  if (!Array.isArray(input.groups) || input.groups.length > MAX_GROUPS) {
    throw schemaError('groups', `ожидается массив до ${MAX_GROUPS} групп`);
  }

  const counter = { count: 0 };
  const groups = input.groups.map((g, i) => parseGroup(g, `groups[${i}]`, counter));

  const groupIds = new Set<string>();
  for (const group of groups) {
    if (groupIds.has(group.id)) throw schemaError('groups', `id "${group.id}" повторяется`);
    groupIds.add(group.id);
  }

  const fields = groups.flatMap((g) => g.fields);
  checkUniqueKeys(fields, 'groups');
  checkVisibleIf(fields, 'groups');

  for (const field of fields) {
    const allowed = RESERVED_FIELD_TYPES[field.key];
    if (allowed && !allowed.includes(field.type)) {
      throw schemaError(field.key, `ключ зарезервирован, тип должен быть ${allowed.join(' или ')}`);
    }
  }

  return { version: 1, groups };
}

function valueError(path: string, message: string): ValidationError {
  return new ValidationError(`${path}: ${message}`);
}

type ErrorFactory = (path: string, message: string) => ValidationError;

function checkUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function checkString(
  value: unknown,
  path: string,
  required: boolean,
  max: number,
  isValid: (v: string) => boolean,
  fail: ErrorFactory,
): string {
  if (typeof value !== 'string') throw fail(path, 'ожидается строка');
  if (value.length > max) throw fail(path, `не длиннее ${max} символов`);
  if (!value.trim()) {
    if (required) throw fail(path, 'обязательное поле');
    return value;
  }
  if (!isValid(value)) throw fail(path, 'неверный формат');
  return value;
}

function checkCount(length: number, field: ShopField, path: string, required: boolean, cap: number, fail: ErrorFactory): void {
  const max = Math.min(field.max ?? cap, cap);
  const min = Math.max(field.min ?? 0, required ? 1 : 0);
  if (length > max) throw fail(path, `не больше ${max}`);
  if (length < min) throw fail(path, required && min === 1 ? 'обязательное поле' : `не меньше ${min}`);
}

export function isFieldVisible(field: ShopField, values: Record<string, unknown>, scope: ShopField[]): boolean {
  const condition = field.visibleIf;
  if (!condition) return true;
  const current = values[condition.key] !== undefined
    ? values[condition.key]
    : scope.find((f) => f.key === condition.key)?.default;
  return Array.isArray(condition.equals) ? condition.equals.includes(current as ShopFieldPrimitive) : condition.equals === current;
}

function checkItems(fields: ShopField[], input: Obj, path: string, fail: ErrorFactory): ShopFieldItem {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: ShopFieldItem = {};
  for (const [key, value] of Object.entries(input)) {
    const field = byKey.get(key);
    if (!field) throw fail(path, `поле "${key}" не объявлено в схеме`);
    const required = !!field.required && isFieldVisible(field, input, fields);
    out[key] = checkValue(field, value, `${path} «${field.label}»`, required, fail);
  }
  return out;
}

function checkValue(field: ShopField, value: unknown, path: string, required: boolean, fail: ErrorFactory): ShopFieldValue {
  switch (field.type) {
    case 'text':
    case 'textarea': {
      const cap = MAX_TEXT[field.type];
      const max = Math.min(field.max ?? cap, cap);
      const text = checkString(value, path, required, max, () => true, fail);
      if (text && field.min !== undefined && text.length < field.min) throw fail(path, `не короче ${field.min} символов`);
      if (text && field.pattern && !new RegExp(field.pattern).test(text)) throw fail(path, 'неверный формат');
      return text;
    }
    case 'url':
    case 'image':
    case 'file':
      return checkString(value, path, required, MAX_URL, checkUrl, fail);
    case 'email':
      return checkString(value, path, required, MAX_EMAIL, (v) => EMAIL_RE.test(v), fail);
    case 'color':
      return checkString(value, path, required, 32, (v) => (field.format === 'tailwind' ? TAILWIND_RE : HEX_RE).test(v), fail);
    case 'date':
      return checkString(value, path, required, 10, (v) => {
        if (!DATE_RE.test(v)) return false;
        const date = new Date(`${v}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
      }, fail);
    case 'datetime':
      return checkString(value, path, required, 64, (v) => Number.isFinite(Date.parse(v)), fail);
    case 'number': {
      if (value === null) {
        if (required) throw fail(path, 'обязательное поле');
        return null;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) throw fail(path, 'ожидается число');
      if (field.integer && !Number.isInteger(value)) throw fail(path, 'ожидается целое число');
      if (field.min !== undefined && value < field.min) throw fail(path, `не меньше ${field.min}`);
      if (field.max !== undefined && value > field.max) throw fail(path, `не больше ${field.max}`);
      return value;
    }
    case 'boolean':
      if (typeof value !== 'boolean') throw fail(path, 'ожидается true или false');
      return value;
    case 'select': {
      const allowed = new Set((field.options ?? []).map((o) => o.value));
      if (field.multiple) {
        if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && allowed.has(v))) {
          throw fail(path, 'значения не из списка вариантов');
        }
        const unique = [...new Set(value as string[])];
        checkCount(unique.length, field, path, required, MAX_OPTIONS, fail);
        return unique;
      }
      if (typeof value !== 'string' || !allowed.has(value)) throw fail(path, 'значение не из списка вариантов');
      return value;
    }
    case 'list': {
      if (!Array.isArray(value)) throw fail(path, 'ожидается массив');
      checkCount(value.length, field, path, required, MAX_LIST_ITEMS, fail);
      return value.map((item, i) => {
        const itemPath = `${path} #${i + 1}`;
        if (!isObj(item)) throw fail(itemPath, 'ожидается объект');
        return checkItems(field.fields ?? [], item, itemPath, fail);
      });
    }
  }
}

export function validateShopFields(schema: ShopSettingsSchema, input: unknown): ShopFieldValues {
  if (!isObj(input)) throw new ValidationError('fields: ожидается объект');
  if (byteSize(input) > MAX_VALUES_BYTES) throw new ValidationError(`Настройки магазина больше ${MAX_VALUES_BYTES / 1024} КБ`);

  const fields = schema.groups.flatMap((g) => g.fields);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: ShopFieldValues = {};
  for (const [key, value] of Object.entries(input)) {
    const field = byKey.get(key);
    if (!field) throw new ValidationError(`Поле "${key}" не объявлено в схеме магазина`);
    const required = !!field.required && isFieldVisible(field, input, fields);
    out[key] = checkValue(field, value, `«${field.label}»`, required, valueError);
  }
  return out;
}

export function findShopField(schema: ShopSettingsSchema | null | undefined, key: string): ShopField | undefined {
  return schema?.groups.flatMap((g) => g.fields).find((f) => f.key === key);
}
