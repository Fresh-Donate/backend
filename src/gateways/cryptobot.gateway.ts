import axios, { type AxiosInstance } from 'axios';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentError } from '@/core/errors';
import type {
  CryptoBotInvoice,
  CryptoBotApiResponse,
  CreateCryptoBotInvoiceParams,
} from '@/types';

const CRYPTOBOT_PROD_URL = 'https://pay.crypt.bot/api';
const CRYPTOBOT_TESTNET_URL = 'https://testnet-pay.crypt.bot/api';

export class CryptoBotGateway {
  private client: AxiosInstance;
  private apiToken: string;
  private baseUrl: string;

  constructor(apiToken: string, testMode = false) {
    this.apiToken = apiToken;
    this.baseUrl = testMode ? CRYPTOBOT_TESTNET_URL : CRYPTOBOT_PROD_URL;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Crypto-Pay-API-Token': apiToken,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  get isTestMode(): boolean {
    return this.baseUrl === CRYPTOBOT_TESTNET_URL;
  }

  async createInvoice(params: CreateCryptoBotInvoiceParams): Promise<CryptoBotInvoice> {
    const currencyType = params.currencyType ?? 'fiat';

    const body: Record<string, unknown> = {
      currency_type: currencyType,
      amount: params.amount.toFixed(2),
    };

    if (currencyType === 'crypto') {
      if (!params.asset) {
        throw new PaymentError('CryptoBot: asset is required for crypto invoices', 'CRYPTOBOT_BAD_REQUEST');
      }
      body.asset = params.asset;
    } else {
      if (!params.fiat) {
        throw new PaymentError('CryptoBot: fiat is required for fiat invoices', 'CRYPTOBOT_BAD_REQUEST');
      }
      body.fiat = params.fiat;
      if (params.acceptedAssets && params.acceptedAssets.length > 0) {
        body.accepted_assets = params.acceptedAssets.join(',');
      }
    }

    if (params.description) body.description = params.description.slice(0, 1024);
    if (params.hiddenMessage) body.hidden_message = params.hiddenMessage;
    if (params.payload) body.payload = params.payload;
    if (params.paidBtnName) body.paid_btn_name = params.paidBtnName;
    if (params.paidBtnUrl) body.paid_btn_url = params.paidBtnUrl;
    if (params.allowComments !== undefined) body.allow_comments = params.allowComments;
    if (params.allowAnonymous !== undefined) body.allow_anonymous = params.allowAnonymous;
    if (params.expiresIn) body.expires_in = params.expiresIn;

    try {
      const { data } = await this.client.post<CryptoBotApiResponse<CryptoBotInvoice>>(
        '/createInvoice',
        body,
      );

      if (!data.ok || !data.result) {
        throw new PaymentError(
          `CryptoBot createInvoice failed: ${data.error?.name || 'unknown'} (${data.error?.code ?? '-'})`,
          'CRYPTOBOT_CREATE_ERROR',
        );
      }

      return data.result;
    } catch (error: any) {
      if (error instanceof PaymentError) throw error;
      const msg = error.response?.data?.error?.name || error.response?.data?.error || error.message;
      throw new PaymentError(`CryptoBot createInvoice failed: ${msg}`, 'CRYPTOBOT_CREATE_ERROR');
    }
  }

  async getInvoice(invoiceId: number | string): Promise<CryptoBotInvoice | null> {
    try {
      const { data } = await this.client.get<CryptoBotApiResponse<{ items: CryptoBotInvoice[] }>>(
        '/getInvoices',
        { params: { invoice_ids: String(invoiceId) } },
      );

      if (!data.ok || !data.result) {
        throw new PaymentError(
          `CryptoBot getInvoice failed: ${data.error?.name || 'unknown'}`,
          'CRYPTOBOT_GET_ERROR',
        );
      }

      return data.result.items[0] || null;
    } catch (error: any) {
      if (error instanceof PaymentError) throw error;
      const msg = error.response?.data?.error?.name || error.message;
      throw new PaymentError(`CryptoBot getInvoice failed: ${msg}`, 'CRYPTOBOT_GET_ERROR');
    }
  }

  // Verify against the raw bytes received - re-serialising would change the
  // signature. Caller must pass the buffer Fastify gave us, not a parsed copy.
  verifyWebhookSignature(rawBody: Buffer | string, signatureHex: string | undefined): boolean {
    if (!signatureHex) return false;

    try {
      const secret = createHash('sha256').update(this.apiToken).digest();
      const expected = createHmac('sha256', secret)
        .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
        .digest('hex');

      const sigBuf = Buffer.from(signatureHex, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length) return false;
      return timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  // Best available invoice URL.
  static pickPayUrl(invoice: CryptoBotInvoice): string | null {
    return invoice.mini_app_invoice_url
      || invoice.bot_invoice_url
      || invoice.web_app_invoice_url
      || invoice.pay_url
      || null;
  }
}
