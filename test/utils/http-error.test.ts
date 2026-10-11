import { test } from 'node:test';
import * as assert from 'node:assert';
import { AxiosError } from 'axios';
import { describeHttpError } from '../../src/utils/http-error';

function httpError(status: number, data: unknown): AxiosError {
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: {} as any,
    data,
  });
}

test('describeHttpError — takes the first non-empty field the provider picks', () => {
  const error = httpError(404, { detail: '', title: 'Invalid Username provided' });
  assert.strictEqual(
    describeHttpError(error, (b) => [b?.detail, b?.title]),
    '404 Invalid Username provided',
  );
});

test('describeHttpError — never prints an object as [object Object]', () => {
  const body = { error: { message: 'Ваш запрос недействителен!' } };
  const text = describeHttpError(httpError(400, body), (b) => [b?.error]);
  assert.strictEqual(text, `400 ${JSON.stringify(body)}`);
});

test('describeHttpError — skips an html error page', () => {
  const text = describeHttpError(httpError(502, '<html><body>Bad Gateway</body></html>'));
  assert.strictEqual(text, '502 Request failed with status code 502');
});

test('describeHttpError — keeps network errors without a status', () => {
  const error = new AxiosError('timeout of 15000ms exceeded', 'ECONNABORTED');
  assert.strictEqual(describeHttpError(error), 'timeout of 15000ms exceeded');
});

test('describeHttpError — passes through non-http errors', () => {
  assert.strictEqual(describeHttpError(new Error('boom')), 'boom');
});

test('describeHttpError — truncates long bodies', () => {
  const text = describeHttpError(httpError(500, 'x'.repeat(1000)));
  assert.strictEqual(text, `500 ${'x'.repeat(300)}`);
});
