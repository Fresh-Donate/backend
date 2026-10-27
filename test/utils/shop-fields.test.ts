import { test } from 'node:test';
import * as assert from 'node:assert';
import { parseShopSchema, validateShopFields, isFieldVisible } from '@/utils/shop-fields';
import { safeFileName } from '@/services/file.service';

const schemaInput = {
  version: 1,
  groups: [
    {
      id: 'general',
      label: 'Общее',
      fields: [
        { key: 'name', type: 'text', label: 'Название', required: true, max: 64, default: 'Shop' },
        { key: 'color', type: 'color', label: 'Цвет', format: 'tailwind', default: 'sky' },
        { key: 'accent', type: 'color', label: 'Акцент' },
        { key: 'cartEnabled', type: 'boolean', label: 'Корзина', default: false },
        { key: 'cartNote', type: 'text', label: 'Подпись', required: true, visibleIf: { key: 'cartEnabled', equals: true } },
        { key: 'online', type: 'number', label: 'Онлайн', integer: true, min: 0, max: 1000 },
        { key: 'mode', type: 'select', label: 'Режим', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a' },
        { key: 'tags', type: 'select', label: 'Теги', multiple: true, max: 2, options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }] },
        { key: 'inn', type: 'text', label: 'ИНН', pattern: '^(\\d{10}|\\d{12})$' },
        { key: 'saleEnds', type: 'datetime', label: 'Конец акции' },
        { key: 'opened', type: 'date', label: 'Открытие' },
        { key: 'rules', type: 'file', label: 'Правила' },
      ],
    },
    {
      id: 'promo',
      label: 'Промо',
      fields: [
        {
          key: 'banners',
          type: 'list',
          label: 'Баннеры',
          max: 3,
          titleKey: 'title',
          fields: [
            { key: 'title', type: 'text', label: 'Заголовок', required: true },
            { key: 'image', type: 'image', label: 'Картинка', required: true },
            { key: 'link', type: 'url', label: 'Ссылка' },
          ],
        },
      ],
    },
  ],
};

const schema = parseShopSchema(schemaInput);

function single(field: Record<string, unknown>) {
  return { version: 1, groups: [{ id: 'a', label: 'A', fields: [field] }] };
}

test('parseShopSchema — keeps known props and drops unknown ones', () => {
  const parsed = parseShopSchema({
    version: 1,
    groups: [{ id: 'g', label: 'G', extra: 1, fields: [{ key: 'a', type: 'text', label: 'A', whatever: true }] }],
  });
  assert.deepStrictEqual(parsed, { version: 1, groups: [{ id: 'g', label: 'G', fields: [{ key: 'a', type: 'text', label: 'A' }] }] });
});

test('parseShopSchema — color format defaults to hex', () => {
  const accent = schema.groups[0].fields.find((f) => f.key === 'accent');
  assert.strictEqual(accent?.format, 'hex');
});

test('parseShopSchema — rejects unknown version', () => {
  assert.throws(() => parseShopSchema({ ...schemaInput, version: 2 }), /версия 1/);
});

test('parseShopSchema — rejects duplicate keys across groups', () => {
  assert.throws(() => parseShopSchema({
    version: 1,
    groups: [
      { id: 'a', label: 'A', fields: [{ key: 'x', type: 'text', label: 'X' }] },
      { id: 'b', label: 'B', fields: [{ key: 'x', type: 'boolean', label: 'X' }] },
    ],
  }), /повторяется/);
});

test('parseShopSchema — rejects unknown type and nested lists', () => {
  assert.throws(() => parseShopSchema(single({ key: 'x', type: 'rich', label: 'X' })), /неизвестный тип/);
  assert.throws(() => parseShopSchema(single({
    key: 'l',
    type: 'list',
    label: 'L',
    fields: [{ key: 'n', type: 'list', label: 'N', fields: [{ key: 'z', type: 'text', label: 'Z' }] }],
  })), /список внутри списка/);
});

test('parseShopSchema — rejects wrong type for reserved key', () => {
  assert.throws(() => parseShopSchema(single({ key: 'cartEnabled', type: 'text', label: 'X' })), /зарезервирован/);
});

test('parseShopSchema — rejects visibleIf pointing to a missing field', () => {
  assert.throws(() => parseShopSchema(single({ key: 'x', type: 'text', label: 'X', visibleIf: { key: 'nope', equals: true } })), /visibleIf/);
});

test('parseShopSchema — validates defaults and select options', () => {
  assert.throws(() => parseShopSchema(single({ key: 's', type: 'select', label: 'S', options: [{ value: 'a', label: 'A' }], default: 'b' })), /default/);
  assert.throws(() => parseShopSchema(single({ key: 's', type: 'select', label: 'S', options: [] })), /вариантов/);
});

test('parseShopSchema — rejects invalid regex pattern', () => {
  assert.throws(() => parseShopSchema(single({ key: 'x', type: 'text', label: 'X', pattern: '(' })), /регулярное/);
});

test('validateShopFields — accepts a full valid payload', () => {
  const out = validateShopFields(schema, {
    name: 'My Shop',
    color: 'emerald',
    accent: '#ff0055',
    cartEnabled: true,
    cartNote: 'Скидка',
    online: 10,
    mode: 'b',
    tags: ['x', 'y', 'x'],
    inn: '1234567890',
    saleEnds: '2026-10-27T12:00:00.000Z',
    opened: '2026-02-28',
    rules: 'https://cdn.example.com/rules.pdf',
    banners: [{ title: 'Лето', image: 'https://cdn.example.com/a.webp', link: '' }],
  });
  assert.deepStrictEqual(out.tags, ['x', 'y']);
  assert.strictEqual(out.name, 'My Shop');
});

test('validateShopFields — rejects keys missing from schema', () => {
  assert.throws(() => validateShopFields(schema, { unknown: 'x' }), /не объявлено/);
});

test('validateShopFields — required, length, number and pattern rules', () => {
  assert.throws(() => validateShopFields(schema, { name: '  ' }), /обязательное/);
  assert.throws(() => validateShopFields(schema, { name: 'x'.repeat(65) }), /не длиннее 64/);
  assert.throws(() => validateShopFields(schema, { online: 1.5 }), /целое/);
  assert.throws(() => validateShopFields(schema, { online: 1001 }), /не больше 1000/);
  assert.throws(() => validateShopFields(schema, { inn: '123' }), /формат/);
  assert.deepStrictEqual(validateShopFields(schema, { inn: '', online: null }), { inn: '', online: null });
});

test('validateShopFields — formats of color, date, url and select', () => {
  assert.throws(() => validateShopFields(schema, { accent: 'red' }), /формат/);
  assert.throws(() => validateShopFields(schema, { color: '#fff' }), /формат/);
  assert.throws(() => validateShopFields(schema, { opened: '2026-02-30' }), /формат/);
  assert.throws(() => validateShopFields(schema, { rules: 'javascript:alert(1)' }), /формат/);
  assert.throws(() => validateShopFields(schema, { mode: 'c' }), /вариантов/);
  assert.throws(() => validateShopFields(schema, { tags: ['x', 'y', 'z'] }), /не больше 2/);
});

test('validateShopFields — required only applies to visible fields', () => {
  assert.doesNotThrow(() => validateShopFields(schema, { cartEnabled: false, cartNote: '' }));
  assert.throws(() => validateShopFields(schema, { cartEnabled: true, cartNote: '' }), /обязательное/);
});

test('validateShopFields — validates list items', () => {
  assert.throws(() => validateShopFields(schema, { banners: [{ title: 'A', image: '' }] }), /#1 «Картинка»: обязательное/);
  assert.throws(() => validateShopFields(schema, { banners: [{ title: 'A', image: 'https://x.y/a.png', extra: 1 }] }), /не объявлено/);
  const four = Array.from({ length: 4 }, () => ({ title: 'A', image: 'https://x.y/a.png' }));
  assert.throws(() => validateShopFields(schema, { banners: four }), /не больше 3/);
});

test('isFieldVisible — falls back to default of the referenced field', () => {
  const fields = schema.groups[0].fields;
  const note = fields.find((f) => f.key === 'cartNote');
  assert.ok(note);
  assert.strictEqual(isFieldVisible(note, {}, fields), false);
  assert.strictEqual(isFieldVisible(note, { cartEnabled: true }, fields), true);
});

test('safeFileName — strips paths and unsafe characters', () => {
  assert.strictEqual(safeFileName('../../etc/passwd'), 'passwd');
  assert.strictEqual(safeFileName('C:\\Users\\me\\Правила сервера.pdf'), 'Правила_сервера.pdf');
  assert.strictEqual(safeFileName('.htaccess'), 'htaccess');
  assert.strictEqual(safeFileName('???'), 'file');
});
