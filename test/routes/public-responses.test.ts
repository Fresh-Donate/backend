import { test } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../helper';
import { ProductService } from '@/services/product.service';
import { PaymentService } from '@/services/payment.service';
import { PaymentOptionService } from '@/services/payment-option.service';

const fullProduct = {
  id: 'p1',
  name: 'VIP',
  price: 100,
  currency: 'RUB',
  quantity: 1,
  description: 'desc',
  type: 'privilege',
  commands: ['lp user {player} parent add vip'],
  imageUrl: '',
  allowCustomCount: false,
  forceDelivery: true,
  activePromotions: [{ id: 'promo1', name: 'Sale', discountPercent: 10 }],
  discountPercent: 10,
  discountedPrice: 90,
  groups: [{ id: 'g1', name: 'Ranks', upgradeMode: true }],
  serverIds: ['s1'],
  servers: [{ id: 's1', name: 'Survival' }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fullPayment = {
  id: 'pay1',
  customerNickname: 'Steve',
  customerEmail: 'steve@example.com',
  productId: 'p1',
  productName: 'VIP',
  productPrice: 100,
  productCurrency: 'RUB',
  currency: 'RUB',
  quantity: 1,
  totalAmount: 100,
  commissionPercent: 5,
  commissionAmount: 5,
  providerAmount: 105,
  status: 'pending',
  paymentOptionId: 'opt1',
  providerId: 'robokassa',
  externalPaymentId: 'ext1',
  externalPaymentUrl: 'https://pay.example.com/ext1',
  paidAt: null,
  deliveredAt: null,
  meta: { cacheKey: 'Steve:abc', robokassa: { invId: 1, hashAlgorithm: 'md5' } },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  userSelectedCount: 1,
  itemsCount: 1,
  items: [],
};

const checkoutKeys = ['externalPaymentUrl', 'id', 'itemsCount', 'status'];

test('GET /products — strips commands and other admin-only fields', async (t) => {
  t.mock.method(ProductService.prototype, 'findAllPublic', async () => [fullProduct]);
  const app = await build(t);

  const res = await app.inject({ method: 'GET', url: '/products' });
  assert.strictEqual(res.statusCode, 200);

  const [product] = JSON.parse(res.payload);
  for (const key of ['commands', 'forceDelivery', 'groups', 'serverIds', 'createdAt', 'updatedAt']) {
    assert.ok(!(key in product), `public product must not expose "${key}"`);
  }
  assert.deepStrictEqual(product.servers, [{ id: 's1', name: 'Survival' }]);
  assert.deepStrictEqual(product.activePromotions, [{ id: 'promo1', name: 'Sale', discountPercent: 10 }]);
  assert.strictEqual(product.discountedPrice, 90);
});

test('POST /payments — returns only checkout fields', async (t) => {
  t.mock.method(PaymentService.prototype, 'create', async () => fullPayment);
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/payments',
    payload: { productId: 'p1', nickname: 'Steve', email: 'steve@example.com', paymentOptionId: 'opt1' },
  });
  assert.strictEqual(res.statusCode, 201);
  assert.deepStrictEqual(Object.keys(JSON.parse(res.payload)).sort(), checkoutKeys);
});

test('POST /payments/cart — returns only checkout fields', async (t) => {
  t.mock.method(PaymentService.prototype, 'createCart', async () => fullPayment);
  const app = await build(t);

  const res = await app.inject({
    method: 'POST',
    url: '/payments/cart',
    payload: {
      items: [{ productId: 'p1' }],
      nickname: 'Steve',
      email: 'steve@example.com',
      paymentOptionId: 'opt1',
    },
  });
  assert.strictEqual(res.statusCode, 201);
  assert.deepStrictEqual(Object.keys(JSON.parse(res.payload)).sort(), checkoutKeys);
});

test('GET /payment-options — returns only fields the shop renders', async (t) => {
  t.mock.method(PaymentOptionService.prototype, 'findEnabled', async () => [{
    id: 'opt1',
    name: 'Card',
    icon: 'i-card',
    providerId: 'yookassa',
    redirectUrl: null,
    sortOrder: 1,
    enabled: true,
  }]);
  const app = await build(t);

  const res = await app.inject({ method: 'GET', url: '/payment-options' });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.payload), [
    { id: 'opt1', name: 'Card', icon: 'i-card', redirectUrl: null },
  ]);
});

test('POST /payments — passes the resolved client ip, not a raw X-Forwarded-For, and limits checkouts per ip', async (t) => {
  const create = t.mock.method(PaymentService.prototype, 'create', async () => fullPayment);
  const app = await build(t);

  const statuses: number[] = [];
  for (let i = 0; i < 21; i++) {
    const res = await app.inject({
      method: 'POST',
      url: '/payments',
      remoteAddress: '203.0.113.7',
      headers: { 'x-forwarded-for': '1.2.3.4' },
      payload: { productId: 'p1', nickname: 'Steve', email: 'steve@example.com', paymentOptionId: 'opt1' },
    });
    statuses.push(res.statusCode);
  }

  assert.strictEqual((create.mock.calls[0]!.arguments[0] as { customerIp: string }).customerIp, '203.0.113.7');
  assert.deepStrictEqual(statuses.slice(0, 20), Array(20).fill(201));
  assert.strictEqual(statuses[20], 429);
});
