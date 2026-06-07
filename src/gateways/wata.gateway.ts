import axios, { type AxiosInstance } from 'axios';
import { createPublicKey, createVerify } from 'node:crypto';
import { PaymentError } from '@/core/errors';
import type {
  WataPaymentLink,
  WataTransaction,
  CreateWataLinkParams,
} from '@/types';

const WATA_PROD_URL = 'https://api.wata.pro/api/h2h';
const WATA_SANDBOX_URL = 'https://api-sandbox.wata.pro/api/h2h';

const publicKeyCache = new Map<string, string>();

// Wata: RUB/EUR/USD payment links. Auth = Bearer JWT issued in dashboard.
// Webhook signatures are RSA-SHA512 over the raw body, base64 in `X-Signature`.
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

  get isTestMode(): boolean {
    return this.baseUrl === WATA_SANDBOX_URL;
  }

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

  async getPaymentLink(id: string): Promise<WataPaymentLink> {
    try {
      const { data } = await this.client.get<WataPaymentLink>(`/links/${id}`);
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.error || error.response?.data?.message || error.message;
      throw new PaymentError(`Wata getPaymentLink failed: ${msg}`, 'WATA_GET_ERROR');
    }
  }

  async getTransaction(transactionId: string): Promise<WataTransaction> {
    try {
      const { data } = await this.client.get<WataTransaction>(`/transactions/${transactionId}`);
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.error || error.response?.data?.message || error.message;
      throw new PaymentError(`Wata getTransaction failed: ${msg}`, 'WATA_GET_ERROR');
    }
  }

  // Public key is cached per base URL for the process lifetime -
  // Wata rotates rarely; clearPublicKeyCache() lets tests / ops force a refresh.
  async fetchPublicKey(): Promise<string> {
    const cached = publicKeyCache.get(this.baseUrl);
    if (cached) return cached;

    try {
      const { data } = await this.client.get('/public-key', {
        transformResponse: [(v) => v],
        responseType: 'text',
      });

      // Endpoint may return raw PEM, or {"value":"<PEM>"} - handle both.
      let pem: string | undefined;
      if (typeof data === 'string') {
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

  // Verify against the EXACT bytes received - re-serialised JSON would
  // produce a different signature (key order, spacing). Caller must pass the
  // raw body Fastify gave it, not a parsed-then-stringified copy.
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

  static clearPublicKeyCache(): void {
    publicKeyCache.clear();
  }
}
