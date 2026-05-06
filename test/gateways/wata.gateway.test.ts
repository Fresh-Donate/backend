import { test, before, after, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { generateKeyPairSync, createSign } from 'node:crypto';
import nock from 'nock';
import { WataGateway } from '../../src/gateways/wata.gateway';
import { PaymentError } from '../../src/core/errors';

const PROD = 'https://api.wata.pro';
const SANDBOX = 'https://api-sandbox.wata.pro';
const PROD_PATH = '/api/h2h';
const API_KEY = 'test-jwt-token';

// Generate one RSA keypair for all signature tests
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' }) as string;

function signBody(raw: Buffer | string): string {
  const signer = createSign('RSA-SHA512');
  signer.update(typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw);
  signer.end();
  return signer.sign(privateKey).toString('base64');
}

before(() => nock.disableNetConnect());
after(() => nock.enableNetConnect());
beforeEach(() => {
  nock.cleanAll();
  WataGateway.clearPublicKeyCache();
});

test('isTestMode — false by default, true when constructed with testMode=true', () => {
  assert.strictEqual(new WataGateway(API_KEY).isTestMode, false);
  assert.strictEqual(new WataGateway(API_KEY, false).isTestMode, false);
  assert.strictEqual(new WataGateway(API_KEY, true).isTestMode, true);
});

test('createPaymentLink — posts to prod base with bearer auth and returns link', async () => {
  const gateway = new WataGateway(API_KEY, false);

  const response = {
    id: 'link_123',
    amount: 500,
    currency: 'RUB',
    orderId: 'pay_abc',
    url: 'https://merchant.wata.pro/pay/link_123',
    status: 'Created',
  };

  let capturedAuth: string | undefined;

  nock(PROD, {
    reqheaders: {
      authorization: (value: string) => { capturedAuth = value; return true; },
    },
  })
    .post(`${PROD_PATH}/links`, (body: any) => {
      assert.strictEqual(body.amount, 500);
      assert.strictEqual(body.currency, 'RUB');
      assert.strictEqual(body.orderId, 'pay_abc');
      assert.strictEqual(body.description, 'Test');
      assert.strictEqual(body.successRedirectUrl, 'https://ret?p=1');
      return true;
    })
    .reply(200, response);

  const result = await gateway.createPaymentLink({
    amount: 500,
    currency: 'RUB',
    orderId: 'pay_abc',
    description: 'Test',
    successRedirectUrl: 'https://ret?p=1',
  });

  assert.strictEqual(result.id, 'link_123');
  assert.strictEqual(result.url, response.url);
  assert.strictEqual(capturedAuth, `Bearer ${API_KEY}`);
});

test('createPaymentLink — uses sandbox base URL when testMode=true', async () => {
  const gateway = new WataGateway(API_KEY, true);

  nock(SANDBOX)
    .post(`${PROD_PATH}/links`)
    .reply(200, {
      id: 'link_sbx',
      amount: 100,
      currency: 'RUB',
      url: 'https://merchant-sandbox.wata.pro/pay/link_sbx',
      status: 'Created',
    });

  const result = await gateway.createPaymentLink({
    amount: 100,
    currency: 'RUB',
    orderId: 'x',
  });

  assert.strictEqual(result.id, 'link_sbx');
  assert.ok(result.url.includes('sandbox'));
});

test('createPaymentLink — rounds amount to 2 decimals', async () => {
  const gateway = new WataGateway(API_KEY);
  let capturedBody: any = null;

  nock(PROD)
    .post(`${PROD_PATH}/links`, (body: any) => { capturedBody = body; return true; })
    .reply(200, { id: 'l', amount: 10.5, currency: 'RUB', url: 'x', status: 'Created' });

  await gateway.createPaymentLink({ amount: 10.499, currency: 'RUB', orderId: 'o' });
  assert.strictEqual(capturedBody.amount, 10.5);
});

test('createPaymentLink — throws PaymentError on validation failure', async () => {
  const gateway = new WataGateway(API_KEY);

  nock(PROD)
    .post(`${PROD_PATH}/links`)
    .reply(400, { validationErrors: [{ message: 'Amount out of range' }] });

  await assert.rejects(
    gateway.createPaymentLink({ amount: 1, currency: 'RUB', orderId: 'o' }),
    (err: any) => {
      assert.ok(err instanceof PaymentError);
      assert.strictEqual(err.code, 'WATA_CREATE_ERROR');
      assert.match(err.message, /Amount out of range/);
      return true;
    },
  );
});

test('getPaymentLink — fetches link by id', async () => {
  const gateway = new WataGateway(API_KEY);

  nock(PROD)
    .get(`${PROD_PATH}/links/link_x`)
    .reply(200, { id: 'link_x', amount: 200, currency: 'RUB', url: 'u', status: 'Paid' });

  const result = await gateway.getPaymentLink('link_x');
  assert.strictEqual(result.status, 'Paid');
});

test('getTransaction — fetches transaction by id', async () => {
  const gateway = new WataGateway(API_KEY);

  nock(PROD)
    .get(`${PROD_PATH}/transactions/tx_1`)
    .reply(200, { id: 'tx_1', status: 'Paid', amount: 100, currency: 'RUB' });

  const result = await gateway.getTransaction('tx_1');
  assert.strictEqual(result.id, 'tx_1');
  assert.strictEqual(result.status, 'Paid');
});

test('verifyWebhookSignature — returns true for valid signature over raw body', async () => {
  const gateway = new WataGateway(API_KEY);
  const raw = Buffer.from(JSON.stringify({ transactionId: 'tx_1', transactionStatus: 'Paid' }), 'utf8');
  const sig = signBody(raw);

  nock(PROD).get(`${PROD_PATH}/public-key`).reply(200, PUBLIC_KEY_PEM);

  const ok = await gateway.verifyWebhookSignature(raw, sig);
  assert.strictEqual(ok, true);
});

test('verifyWebhookSignature — returns false when signature does not match body', async () => {
  const gateway = new WataGateway(API_KEY);
  const raw = Buffer.from('{"a":1}', 'utf8');
  const sig = signBody(Buffer.from('{"a":2}', 'utf8')); // signed different bytes

  nock(PROD).get(`${PROD_PATH}/public-key`).reply(200, PUBLIC_KEY_PEM);

  const ok = await gateway.verifyWebhookSignature(raw, sig);
  assert.strictEqual(ok, false);
});

test('verifyWebhookSignature — returns false when header missing', async () => {
  const gateway = new WataGateway(API_KEY);
  const ok = await gateway.verifyWebhookSignature(Buffer.from('{}'), undefined);
  assert.strictEqual(ok, false);
});

test('verifyWebhookSignature — caches public key across calls', async () => {
  const gateway = new WataGateway(API_KEY);
  const raw = Buffer.from('{"x":1}', 'utf8');
  const sig = signBody(raw);

  // Only ONE /public-key call mocked; if the gateway fetched twice, the second
  // verify would fail with "Nock: No match" (ECONNREFUSED after disableNetConnect).
  nock(PROD).get(`${PROD_PATH}/public-key`).once().reply(200, PUBLIC_KEY_PEM);

  assert.strictEqual(await gateway.verifyWebhookSignature(raw, sig), true);
  assert.strictEqual(await gateway.verifyWebhookSignature(raw, sig), true);
});

test('verifyWebhookSignature — accepts JSON-wrapped public key response', async () => {
  const gateway = new WataGateway(API_KEY, true); // fresh base URL for a fresh cache slot
  const raw = Buffer.from('{"x":2}', 'utf8');
  const sig = signBody(raw);

  nock(SANDBOX)
    .get(`${PROD_PATH}/public-key`)
    .reply(200, JSON.stringify({ value: PUBLIC_KEY_PEM }), {
      'content-type': 'application/json',
    });

  assert.strictEqual(await gateway.verifyWebhookSignature(raw, sig), true);
});
