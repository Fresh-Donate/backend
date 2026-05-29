import { test, before, after, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { createHash, createHmac } from 'node:crypto';
import nock from 'nock';
import { CryptoBotGateway } from '../../src/gateways/cryptobot.gateway';
import { PaymentError } from '../../src/core/errors';

const PROD = 'https://pay.crypt.bot';
const TESTNET = 'https://testnet-pay.crypt.bot';
const TOKEN = '12345:AAfakeToken';

function webhookSignature(body: string, token = TOKEN): string {
  const secret = createHash('sha256').update(token).digest();
  return createHmac('sha256', secret).update(body).digest('hex');
}

before(() => nock.disableNetConnect());
after(() => nock.enableNetConnect());
beforeEach(() => nock.cleanAll());

test('createInvoice — sends fiat invoice with token header', async () => {
  const gateway = new CryptoBotGateway(TOKEN);
  let captured: any = null;
  let tokenHeader: string | undefined;

  nock(PROD, {
    reqheaders: {
      'crypto-pay-api-token': (v: string) => { tokenHeader = v; return true; },
    },
  })
    .post('/api/createInvoice', (body: any) => { captured = body; return true; })
    .reply(200, {
      ok: true,
      result: stubInvoice({ invoice_id: 42, mini_app_invoice_url: 'https://t.me/CryptoBot/app?startapp=42' }),
    });

  const inv = await gateway.createInvoice({
    currencyType: 'fiat',
    fiat: 'USD',
    amount: 15,
    description: 'Test invoice',
    payload: 'payment-id-1',
    paidBtnName: 'callback',
    paidBtnUrl: 'https://example.com/return',
    expiresIn: 3600,
  });

  assert.strictEqual(tokenHeader, TOKEN);
  assert.strictEqual(captured.currency_type, 'fiat');
  assert.strictEqual(captured.fiat, 'USD');
  assert.strictEqual(captured.amount, '15.00');
  assert.strictEqual(captured.payload, 'payment-id-1');
  assert.strictEqual(captured.paid_btn_name, 'callback');
  assert.strictEqual(captured.expires_in, 3600);

  assert.strictEqual(inv.invoice_id, 42);
  assert.strictEqual(
    CryptoBotGateway.pickPayUrl(inv),
    'https://t.me/CryptoBot/app?startapp=42',
  );
});

test('createInvoice — sends crypto invoice with asset', async () => {
  const gateway = new CryptoBotGateway(TOKEN);
  let captured: any = null;

  nock(PROD)
    .post('/api/createInvoice', (body: any) => { captured = body; return true; })
    .reply(200, { ok: true, result: stubInvoice() });

  await gateway.createInvoice({
    currencyType: 'crypto',
    asset: 'USDT',
    amount: 10,
  });

  assert.strictEqual(captured.currency_type, 'crypto');
  assert.strictEqual(captured.asset, 'USDT');
  assert.strictEqual(captured.amount, '10.00');
  assert.strictEqual(captured.fiat, undefined);
});

test('createInvoice — throws when fiat invoice is missing fiat code', async () => {
  const gateway = new CryptoBotGateway(TOKEN);
  await assert.rejects(
    gateway.createInvoice({ currencyType: 'fiat', amount: 1 }),
    (err: any) => err instanceof PaymentError && err.code === 'CRYPTOBOT_BAD_REQUEST',
  );
});

test('createInvoice — throws when API returns ok=false', async () => {
  const gateway = new CryptoBotGateway(TOKEN);

  nock(PROD)
    .post('/api/createInvoice')
    .reply(200, { ok: false, error: { code: 401, name: 'UNAUTHORIZED' } });

  await assert.rejects(
    gateway.createInvoice({ currencyType: 'fiat', fiat: 'USD', amount: 1 }),
    (err: any) => err.code === 'CRYPTOBOT_CREATE_ERROR' && /UNAUTHORIZED/.test(err.message),
  );
});

test('testnet mode uses sandbox base URL', async () => {
  const gateway = new CryptoBotGateway(TOKEN, true);

  nock(TESTNET)
    .post('/api/createInvoice')
    .reply(200, { ok: true, result: stubInvoice() });

  await gateway.createInvoice({ currencyType: 'fiat', fiat: 'USD', amount: 1 });
  assert.strictEqual(gateway.isTestMode, true);
});

test('getInvoice — fetches by id', async () => {
  const gateway = new CryptoBotGateway(TOKEN);

  nock(PROD)
    .get('/api/getInvoices')
    .query({ invoice_ids: '99' })
    .reply(200, { ok: true, result: { items: [stubInvoice({ invoice_id: 99, status: 'paid' })] } });

  const inv = await gateway.getInvoice(99);
  assert.ok(inv);
  assert.strictEqual(inv!.invoice_id, 99);
  assert.strictEqual(inv!.status, 'paid');
});

test('verifyWebhookSignature — accepts a valid signature over the raw bytes', () => {
  const gateway = new CryptoBotGateway(TOKEN);
  const body = JSON.stringify({ update_id: 1, update_type: 'invoice_paid', payload: { invoice_id: 1 } });
  const sig = webhookSignature(body);

  assert.strictEqual(gateway.verifyWebhookSignature(Buffer.from(body), sig), true);
});

test('verifyWebhookSignature — rejects a tampered signature', () => {
  const gateway = new CryptoBotGateway(TOKEN);
  const body = '{"hello":"world"}';
  const sig = webhookSignature(body).slice(0, -2) + '00';

  assert.strictEqual(gateway.verifyWebhookSignature(Buffer.from(body), sig), false);
});

test('verifyWebhookSignature — rejects when signature is missing', () => {
  const gateway = new CryptoBotGateway(TOKEN);
  assert.strictEqual(gateway.verifyWebhookSignature(Buffer.from('{}'), undefined), false);
});

test('pickPayUrl — prefers mini app → bot → web app → legacy pay_url', () => {
  assert.strictEqual(
    CryptoBotGateway.pickPayUrl(stubInvoice({
      mini_app_invoice_url: 'mini',
      bot_invoice_url: 'bot',
      web_app_invoice_url: 'web',
      pay_url: 'legacy',
    })),
    'mini',
  );
  assert.strictEqual(
    CryptoBotGateway.pickPayUrl(stubInvoice({
      mini_app_invoice_url: undefined,
      bot_invoice_url: 'bot',
      pay_url: 'legacy',
    })),
    'bot',
  );
  assert.strictEqual(
    CryptoBotGateway.pickPayUrl(stubInvoice({
      mini_app_invoice_url: undefined,
      bot_invoice_url: undefined,
      web_app_invoice_url: undefined,
      pay_url: 'legacy',
    })),
    'legacy',
  );
  assert.strictEqual(
    CryptoBotGateway.pickPayUrl(stubInvoice({
      mini_app_invoice_url: undefined,
      bot_invoice_url: undefined,
      web_app_invoice_url: undefined,
      pay_url: undefined,
    })),
    null,
  );
});

function stubInvoice(overrides: Partial<Record<string, any>> = {}) {
  return {
    invoice_id: 1,
    hash: 'hash',
    currency_type: 'fiat' as const,
    fiat: 'USD' as const,
    amount: '1.00',
    status: 'active' as const,
    created_at: 'now',
    mini_app_invoice_url: 'https://t.me/CryptoBot/app?startapp=1',
    bot_invoice_url: 'https://t.me/CryptoBot?start=1',
    pay_url: 'https://pay.crypt.bot/1',
    ...overrides,
  };
}
