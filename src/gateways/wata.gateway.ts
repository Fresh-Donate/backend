import axios, { type AxiosInstance } from 'axios';
import { createPublicKey, createVerify } from 'node:crypto';
import { PaymentError } from '@/core/errors';

/**
 * Wata base URLs.
 *  - production: https://api.wata.pro/api/h2h/
 *  - sandbox:    https://api-sandbox.wata.pro/api/h2h/
 */
const WATA_PROD_URL = 'https://api.wata.pro/api/h2h';
const WATA_SANDBOX_URL = 'https://api-sandbox.wata.pro/api/h2h';

/**
 * Wata transaction / payment link statuses
 * @see https://wata.pro/api
 *
 *  - Created  — link created, awaiting payer / pre-payment webhooks
 *  - Pending  — bank is processing
 *  - Paid     — successful
 *  - Declined — failed
 */
export type WataStatus = 'Created' | 'Pending' | 'Paid' | 'Declined';

export interface WataPaymentLink {
  id: string;
  amount: number;
  currency: string;
  orderId?: string;
  description?: string;
  url: string;
  status: WataStatus;
  creationTime?: string;
  expirationDateTime?: string;
  successRedirectUrl?: string;
  failRedirectUrl?: string;
}

export interface WataTransaction {
  id: string;
  paymentLinkId?: string;
  orderId?: string;
  status: WataStatus;
  amount: number;
  currency: string;
  paymentTime?: string;
  errorCode?: string;
  errorDescription?: string;
}

export interface WataWebhookPayload {
  /** Transaction id */
  transactionId?: string;
  /** Link id (pre-payment) */
  paymentLinkId?: string;
  /** Our order id (= our payment.id) */
  orderId?: string;
  /** Transaction status */
  transactionStatus?: WataStatus;
  /** Generic status field (some webhook types use this) */
  status?: WataStatus;
  /** Amount that was actually charged */
  amount?: number;
  currency?: string;
  paymentTime?: string;
  errorCode?: string;
  errorDescription?: string;
  [key: string]: unknown;
}

export interface CreateWataLinkParams {
  amount: number;
  currency: 'RUB' | 'EUR' | 'USD';
  orderId: string;
  description?: string;
  successRedirectUrl?: string;
  failRedirectUrl?: string;
  /** Optional: link lifetime, ISO-8601. Default = 3 days */
  expirationDateTime?: string;
}

/** In-memory cache of fetched public keys, keyed by base URL. */
const publicKeyCache = new Map<string, string>();

/**
 * Wata Payment Gateway
 * @see https://wata.pro/api
 *
 * Wata is a Russian payment provider supporting RUB/EUR/USD payments.
 * Auth: Bearer JWT access token issued in the merchant dashboard.
 * Webhook signatures are RSA-SHA512 over the raw body, base64 in `X-Signature`.
 */
export class WataGateway {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(apiKey: string, testMode = false) {
    this.baseUrl = testMode ? WATA_SANDBOX_URL : WATA_PROD_URL;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  /** Returns `true` when this gateway is configured against the sandbox. */
  get isTestMode(): boolean {
    return this.baseUrl === WATA_SANDBOX_URL;
  }

  /**
   * Create a one-time payment link.
   * @see POST /api/h2h/links
   */
  async createPaymentLink(params: CreateWataLinkParams): Promise<WataPaymentLink> {
    const body: Record<string, unknown> = {
      amount: Number(params.amount.toFixed(2)),
      currency: params.currency,
      orderId: params.orderId,
    };

    if (params.description) body.description = params.description;
    if (params.successRedirectUrl) body.successRedirectUrl = params.successRedirectUrl;
    if (params.failRedirectUrl) body.failRedirectUrl = params.failRedirectUrl;
    if (params.expirationDateTime) body.expirationDateTime = params.expirationDateTime;

    try {
      const { data } = await this.client.post<WataPaymentLink>('/links', body);
      return data;
    } catch (error: any) {
      const msg =
        error.response?.data?.error
        || error.response?.data?.message
        || error.response?.data?.validationErrors?.[0]?.message
        || error.message;
      throw new PaymentError(`Wata createPaymentLink failed: ${msg}`, 'WATA_CREATE_ERROR');
    }
  }

  /**
   * Fetch an existing payment link.
   * @see GET /api/h2h/links/{id}
   */
  async getPaymentLink(id: string): Promise<WataPaymentLink> {
    try {
      const { data } = await this.client.get<WataPaymentLink>(`/links/${id}`);
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.error || error.response?.data?.message || error.message;
      throw new PaymentError(`Wata getPaymentLink failed: ${msg}`, 'WATA_GET_ERROR');
    }
  }

  /**
   * Fetch a transaction by id.
   * @see GET /api/h2h/transactions/{transactionId}
   */
  async getTransaction(transactionId: string): Promise<WataTransaction> {
    try {
      const { data } = await this.client.get<WataTransaction>(`/transactions/${transactionId}`);
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.error || error.response?.data?.message || error.message;
      throw new PaymentError(`Wata getTransaction failed: ${msg}`, 'WATA_GET_ERROR');
    }
  }

  /**
   * Fetch Wata's webhook-signing public key (PEM).
   * Cached in-memory per base URL for the lifetime of the process.
   * @see GET /api/h2h/public-key
   */
  async fetchPublicKey(): Promise<string> {
    const cached = publicKeyCache.get(this.baseUrl);
    if (cached) return cached;

    try {
      const { data } = await this.client.get('/public-key', {
        // Public key endpoint may return text/plain; accept anything
        transformResponse: [(v) => v],
        responseType: 'text',
      });

      let pem: string | undefined;
      if (typeof data === 'string') {
        // Could be plain PEM, or a JSON string like {"value":"..."}
        const trimmed = data.trim();
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed);
            pem = parsed.value || parsed.publicKey || parsed.key;
          } catch {
            pem = trimmed;
          }
        } else {
          pem = trimmed;
        }
      } else if (data && typeof data === 'object') {
        pem = (data as any).value || (data as any).publicKey || (data as any).key;
      }

      if (!pem) {
        throw new PaymentError('Wata public key response is empty', 'WATA_PUBKEY_ERROR');
      }

      publicKeyCache.set(this.baseUrl, pem);
      return pem;
    } catch (error: any) {
      if (error instanceof PaymentError) throw error;
      const msg = error.response?.data?.error || error.response?.data?.message || error.message;
      throw new PaymentError(`Wata fetchPublicKey failed: ${msg}`, 'WATA_PUBKEY_ERROR');
    }
  }

  /**
   * Verify an incoming webhook signature.
   *
   * Wata signs raw request body bytes with RSA-SHA512 and ships the base64
   * signature in the `X-Signature` header. Verification MUST be done against
   * the exact bytes that were received — NOT a re-serialised JSON.
   *
   * @param rawBody  Raw request body (Buffer or UTF-8 string).
   * @param signatureBase64  Value of the `X-Signature` header.
   */
  async verifyWebhookSignature(
    rawBody: Buffer | string,
    signatureBase64: string | undefined,
  ): Promise<boolean> {
    if (!signatureBase64) return false;

    let publicKeyPem: string;
    try {
      publicKeyPem = await this.fetchPublicKey();
    } catch {
      return false;
    }

    try {
      const key = createPublicKey(publicKeyPem);
      const verifier = createVerify('RSA-SHA512');
      verifier.update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody);
      verifier.end();
      return verifier.verify(key, Buffer.from(signatureBase64, 'base64'));
    } catch {
      return false;
    }
  }

  /** Clear the cached public key for this base URL. Useful for tests / key rotation. */
  static clearPublicKeyCache(): void {
    publicKeyCache.clear();
  }
}
