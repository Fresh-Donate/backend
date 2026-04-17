import { test } from 'node:test';
import * as assert from 'node:assert';
import { build } from '../helper';

// These tests verify admin-only routes reject unauthenticated requests.
// We don't test the happy path here because that requires a live DB.
// Public-GET endpoints (products GET /, etc.) are excluded — they hit the DB.

type Case = { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; url: string; payload?: unknown };

const PROTECTED: Case[] = [
  { method: 'POST', url: '/products', payload: { name: 'x', price: 1, currency: 'RUB', quantity: 1, type: 'item' } },
  { method: 'PUT', url: '/products/some-id', payload: { name: 'y' } },
  { method: 'DELETE', url: '/products/some-id' },
  { method: 'POST', url: '/products/some-id/duplicate' },

  { method: 'PUT', url: '/settings' },
  { method: 'PUT', url: '/shop-settings' },

  { method: 'PUT', url: '/payment-providers/yookassa' },
  { method: 'POST', url: '/payment-options', payload: { label: 'x' } },
  { method: 'PUT', url: '/payment-options/some-id' },
  { method: 'DELETE', url: '/payment-options/some-id' },

  { method: 'POST', url: '/payments/some-id/confirm' },
  { method: 'POST', url: '/payments/some-id/retry-delivery' },

  // GET endpoints that require admin auth
  { method: 'GET', url: '/customers' },
  { method: 'GET', url: '/customers/some-id' },
  { method: 'GET', url: '/customers/some-id/payments' },
  { method: 'GET', url: '/payments' },
  { method: 'GET', url: '/payments/some-id' },
  { method: 'GET', url: '/payment-providers' },
  { method: 'GET', url: '/payment-providers/yookassa' },
  { method: 'GET', url: '/payment-options/all' },
  { method: 'GET', url: '/settings' },
  { method: 'GET', url: '/stats' },
  { method: 'GET', url: '/stats/chart?from=2026-01-01&to=2026-01-31' },
];

for (const c of PROTECTED) {
  test(`${c.method} ${c.url} — 401 without JWT`, async (t) => {
    const app = await build(t);
    const res = await app.inject({
      method: c.method,
      url: c.url,
      payload: c.payload,
    });
    assert.strictEqual(res.statusCode, 401, `expected 401 for ${c.method} ${c.url}, got ${res.statusCode}`);
  });
}

test('Protected admin routes — invalid bearer token gets 401', async (t) => {
  const app = await build(t);
  const res = await app.inject({
    method: 'DELETE',
    url: '/products/some-id',
    headers: { authorization: 'Bearer garbage.token.value' },
  });
  assert.strictEqual(res.statusCode, 401);
});
