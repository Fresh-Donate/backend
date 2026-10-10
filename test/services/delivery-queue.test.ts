import { test, type TestContext } from 'node:test';
import * as assert from 'node:assert';
import { DeliveryService, planFor, matchReported, type Order } from '../../src/services/delivery.service';
import { Payment } from '../../src/models/payment.model';
import { PaymentItem } from '../../src/models/payment-item.model';
import { Product } from '../../src/models/product.model';
import { PaymentDelivery } from '../../src/models/payment-delivery.model';

function order(): Order {
  const payment = { id: 'pay-1', customerNickname: 'Steve', userSelectedCount: 1, itemsCount: 2 };
  const items = [
    { id: 'item-1', paymentId: 'pay-1', productId: 'apple', productName: 'Apple', quantity: 2, userSelectedCount: 3 },
    { id: 'item-2', paymentId: 'pay-1', productId: 'vip', productName: 'VIP', quantity: 1, userSelectedCount: 1 },
  ];
  const products = [
    {
      id: 'apple',
      name: 'Apple',
      quantity: 2,
      commands: ['give {player} apple {amount}', 'say {player} got apples'],
      forceDelivery: false,
      servers: [{ id: 's1' }],
    },
    {
      id: 'vip',
      name: 'VIP',
      quantity: 1,
      commands: ['lp user {player} parent add vip'],
      forceDelivery: true,
      servers: [{ id: 's2' }],
    },
  ];
  return { payment, items, productById: new Map(products.map((p) => [p.id, p])) } as unknown as Order;
}

function stubJob(t: TestContext, current: Order) {
  t.mock.method(PaymentDelivery, 'findOne', async () => ({
    id: 'job-1',
    paymentId: 'pay-1',
    serverId: null,
    status: 'pending',
    attempts: 0,
    meta: {},
  }));
  t.mock.method(Payment, 'findAll', async () => [current.payment]);
  t.mock.method(PaymentItem, 'findAll', async () => current.items);
  t.mock.method(Product, 'findAll', async () => [...current.productById.values()]);
  t.mock.method(PaymentDelivery, 'findAll', async () => [{ status: 'delivered' }]);
  return {
    paymentUpdates: t.mock.method(Payment, 'update', async () => [1]),
    jobUpdates: t.mock.method(PaymentDelivery, 'update', async () => [1]),
  };
}

test('planFor — resolves variables and skips commands that already ran', () => {
  const plan = planFor(order(), null, new Set(['item-1:0']));

  assert.deepStrictEqual(plan.lines, [
    { key: 'item-1:1', command: 'say Steve got apples' },
    { key: 'item-2:0', command: 'lp user Steve parent add vip' },
  ]);
  assert.strictEqual(plan.requireOnline, true);
});

test('planFor — only commands still to run decide whether the player must be online', () => {
  const plan = planFor(order(), null, new Set(['item-1:0', 'item-1:1']));

  assert.strictEqual(plan.requireOnline, false);
});

test('planFor — a server only gets the products bound to it', () => {
  const plan = planFor(order(), 's2', new Set());

  assert.deepStrictEqual(plan.lines.map((l) => l.key), ['item-2:0']);
});

test('matchReported — each successful command marks one pending line, duplicates included', () => {
  const lines = [
    { key: 'a', command: 'give Steve apple 1' },
    { key: 'b', command: 'give Steve apple 1' },
    { key: 'c', command: 'say hi' },
  ];

  const succeeded = matchReported(lines, [
    { command: 'give Steve apple 1', success: true, response: 'OK' },
    { command: 'give Steve apple 1', success: false, response: 'Command returned false' },
    { command: 'say hi', success: true, response: 'OK' },
    { command: 'say bye', success: true, response: 'OK' },
  ]);

  assert.deepStrictEqual(succeeded, ['a', 'c']);
});

test('reportFromPlugin — a partial failure keeps the job pending and remembers only the commands that ran', async (t) => {
  const { jobUpdates } = stubJob(t, order());

  const status = await new DeliveryService().reportFromPlugin('pay-1', null, false, [
    { command: 'give Steve apple 6', success: true, response: 'OK' },
    { command: 'say Steve got apples', success: false, response: 'Command returned false' },
    { command: 'lp user Steve parent add vip', success: true, response: 'OK' },
  ]);

  assert.strictEqual(status, 'pending');
  const values = jobUpdates.mock.calls[0]!.arguments[0] as { attempts: number; meta: { doneCommands: string[] } };
  assert.strictEqual(values.attempts, 1);
  assert.deepStrictEqual(values.meta.doneCommands, ['item-1:0', 'item-2:0']);
});

test('reportFromPlugin — a successful report finishes the job and the payment', async (t) => {
  const { jobUpdates, paymentUpdates } = stubJob(t, order());

  const status = await new DeliveryService().reportFromPlugin('pay-1', null, true, [
    { command: 'give Steve apple 6', success: true, response: 'OK' },
    { command: 'say Steve got apples', success: true, response: 'OK' },
    { command: 'lp user Steve parent add vip', success: true, response: 'OK' },
  ]);

  assert.strictEqual(status, 'delivered');
  assert.strictEqual((jobUpdates.mock.calls[0]!.arguments[0] as { status: string }).status, 'delivered');
  assert.ok(paymentUpdates.mock.calls.some((call) => (call.arguments[0] as { status?: string }).status === 'delivered'));
});
