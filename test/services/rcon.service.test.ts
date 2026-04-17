import { test } from 'node:test';
import * as assert from 'node:assert';
import { RconService } from '../../src/services/rcon.service';

// Expose the private `resolveVariables` method for testing
class RconTestProbe extends RconService {
  public resolve(cmd: string, vars: Record<string, string>): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this as any).resolveVariables(cmd, vars);
  }
}

test('RconService.resolveVariables — substitutes a single variable', () => {
  const svc = new RconTestProbe();
  const result = svc.resolve('give {player} diamond', { player: 'Steve' });
  assert.strictEqual(result, 'give Steve diamond');
});

test('RconService.resolveVariables — substitutes multiple variables', () => {
  const svc = new RconTestProbe();
  const result = svc.resolve('give {player} {item} {count}', {
    player: 'Alex',
    item: 'iron_sword',
    count: '1',
  });
  assert.strictEqual(result, 'give Alex iron_sword 1');
});

test('RconService.resolveVariables — replaces repeated occurrences', () => {
  const svc = new RconTestProbe();
  const result = svc.resolve('say Hi {player}! Welcome {player}!', { player: 'Bob' });
  assert.strictEqual(result, 'say Hi Bob! Welcome Bob!');
});

test('RconService.resolveVariables — leaves unknown placeholders untouched', () => {
  const svc = new RconTestProbe();
  const result = svc.resolve('give {player} {item}', { player: 'Steve' });
  assert.strictEqual(result, 'give Steve {item}');
});

test('RconService.resolveVariables — handles empty variable map', () => {
  const svc = new RconTestProbe();
  const result = svc.resolve('kick {player}', {});
  assert.strictEqual(result, 'kick {player}');
});

test('RconService.resolveVariables — handles no placeholders', () => {
  const svc = new RconTestProbe();
  const result = svc.resolve('list', { anything: 'value' });
  assert.strictEqual(result, 'list');
});

test('RconService.resolveVariables — values containing braces work', () => {
  const svc = new RconTestProbe();
  const result = svc.resolve('give {player} item', { player: '{Notch}' });
  assert.strictEqual(result, 'give {Notch} item');
});
