import { test } from 'node:test';
import * as assert from 'node:assert';
import { buildFunnel, type FunnelOrder } from '../../src/utils/funnel';

const T0 = new Date('2026-10-01T12:00:00Z').getTime();
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const TO = new Date(T0 + 10 * DAY);

function order(nickname: string, offsetMs: number, patch: Partial<FunnelOrder> = {}): FunnelOrder {
  return {
    nickname,
    providerId: 'wata',
    status: 'expired',
    createdAt: new Date(T0 + offsetMs),
    paidAt: null,
    deliveredAt: null,
    ...patch,
  };
}

function paid(nickname: string, offsetMs: number, patch: Partial<FunnelOrder> = {}): FunnelOrder {
  return order(nickname, offsetMs, {
    status: 'delivered',
    paidAt: new Date(T0 + offsetMs + MIN),
    deliveredAt: new Date(T0 + offsetMs + 2 * MIN),
    ...patch,
  });
}

test('buildFunnel - recreated orders within the gap form one paid attempt', () => {
  const result = buildFunnel([
    order('Steve', 0, { providerId: 'tebex' }),
    order('steve', 10 * MIN, { providerId: 'tebex' }),
    paid('Steve', 20 * MIN),
  ], TO);

  assert.strictEqual(result.orders, 3);
  assert.strictEqual(result.attempts, 1);
  assert.strictEqual(result.paid, 1);
  assert.strictEqual(result.paidFirstTry, 0);
  assert.strictEqual(result.delivered, 1);
  assert.strictEqual(result.medianSecondsToPay, 21 * 60);

  const tebex = result.providers.find((p) => p.providerId === 'tebex');
  assert.deepStrictEqual(tebex, { providerId: 'tebex', attempts: 1, paid: 0, switched: 1, lost: 0 });
});

test('buildFunnel - an order after a paid one starts a new attempt', () => {
  const result = buildFunnel([paid('Alex', 0), paid('Alex', 5 * MIN)], TO);

  assert.strictEqual(result.attempts, 2);
  assert.strictEqual(result.paid, 2);
  assert.strictEqual(result.paidFirstTry, 2);
});

test('buildFunnel - classifies unpaid attempts', () => {
  const result = buildFunnel([
    order('Back', 0),
    paid('Back', 2 * DAY),
    order('Gone', 0),
    order('Declined', 0, { status: 'failed' }),
    order('Waiting', 9 * DAY, { status: 'pending' }),
    order('Late', 0),
    paid('Late', 8 * DAY),
  ], TO);

  assert.strictEqual(result.attempts, 7);
  assert.strictEqual(result.paid, 2);
  assert.strictEqual(result.returnedLater, 1);
  assert.strictEqual(result.left, 2);
  assert.strictEqual(result.leftAfterDecline, 1);
  assert.strictEqual(result.awaitingPayment, 1);
});

test('buildFunnel - attempts after the range only count as returns', () => {
  const result = buildFunnel([order('Steve', 9 * DAY), paid('Steve', 12 * DAY)], TO);

  assert.strictEqual(result.attempts, 1);
  assert.strictEqual(result.orders, 1);
  assert.strictEqual(result.returnedLater, 1);
  assert.strictEqual(result.paid, 0);
});

test('buildFunnel - delivery states of paid attempts', () => {
  const result = buildFunnel([
    paid('A', 0, { status: 'paid', deliveredAt: null }),
    paid('B', 0, { status: 'failed', deliveredAt: null }),
    paid('C', 0, { status: 'refunded', deliveredAt: null }),
    paid('D', 0, { status: 'refunded' }),
  ], TO);

  assert.strictEqual(result.awaitingDelivery, 1);
  assert.strictEqual(result.deliveryFailed, 1);
  assert.strictEqual(result.refundedBeforeDelivery, 1);
  assert.strictEqual(result.delivered, 1);
  assert.strictEqual(result.refunded, 2);
});
