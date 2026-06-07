import { test } from 'node:test';
import * as assert from 'node:assert';
import { resolveCommandVariables, buildCommandVariables } from '../../src/utils/command-variables';
import type { Payment } from '../../src/models/payment.model';
import type { Product } from '../../src/models/product.model';
import type { PaymentItem } from '../../src/models/payment-item.model';

test('resolveCommandVariables — substitutes a single variable', () => {
  const result = resolveCommandVariables('give {player} diamond', { player: 'Steve' });
  assert.strictEqual(result, 'give Steve diamond');
});

test('resolveCommandVariables — substitutes multiple variables', () => {
  const result = resolveCommandVariables('give {player} {item} {count}', {
    player: 'Alex',
    item: 'iron_sword',
    count: '1',
  });
  assert.strictEqual(result, 'give Alex iron_sword 1');
});

test('resolveCommandVariables — replaces repeated occurrences', () => {
  const result = resolveCommandVariables('say Hi {player}! Welcome {player}!', { player: 'Bob' });
  assert.strictEqual(result, 'say Hi Bob! Welcome Bob!');
});

test('resolveCommandVariables — leaves unknown placeholders untouched', () => {
  const result = resolveCommandVariables('give {player} {item}', { player: 'Steve' });
  assert.strictEqual(result, 'give Steve {item}');
});

test('resolveCommandVariables — handles empty variable map', () => {
  const result = resolveCommandVariables('kick {player}', {});
  assert.strictEqual(result, 'kick {player}');
});

test('resolveCommandVariables — handles no placeholders', () => {
  const result = resolveCommandVariables('list', { anything: 'value' });
  assert.strictEqual(result, 'list');
});

test('resolveCommandVariables — values containing braces work', () => {
  const result = resolveCommandVariables('give {player} item', { player: '{Notch}' });
  assert.strictEqual(result, 'give {Notch} item');
});

test('buildCommandVariables — legacy path uses payment-level count', () => {
  const payment = { customerNickname: 'Steve', userSelectedCount: 3 } as Payment;
  const product = { name: 'Coins', quantity: 10 } as Product;
  const vars = buildCommandVariables(payment, product);
  assert.strictEqual(vars.player, 'Steve');
  assert.strictEqual(vars.product, 'Coins');
  assert.strictEqual(vars.amount, '30'); // quantity(10) * count(3)
});

test('buildCommandVariables — cart item overrides count/name from the line snapshot', () => {
  const payment = { customerNickname: 'Alex', userSelectedCount: 1 } as Payment;
  const product = { name: 'Current name', quantity: 1 } as Product;
  const item = { productName: 'Snapshot name', quantity: 5, userSelectedCount: 4 } as PaymentItem;
  const vars = buildCommandVariables(payment, product, item);
  assert.strictEqual(vars.player, 'Alex');
  assert.strictEqual(vars.product, 'Snapshot name'); // from item snapshot
  assert.strictEqual(vars.amount, '20'); // item.quantity(5) * item.userSelectedCount(4)
});
