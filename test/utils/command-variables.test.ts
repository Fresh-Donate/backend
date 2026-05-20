import { test } from 'node:test';
import * as assert from 'node:assert';
import { resolveCommandVariables } from '../../src/utils/command-variables';

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
