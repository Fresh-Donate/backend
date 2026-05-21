import axios, { type AxiosInstance } from 'axios';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentError } from '@/core/errors';
import type {
  TebexCheckoutResponse,
  CreateTebexCheckoutParams,
} from '@/types';

const TEBEX_CHECKOUT_API_URL = 'https://checkout.tebex.io/api';

// Tebex Checkout API. Project ID + Private Key are pasted from
// developer settings in tebex.io. The `/checkout` endpoint requires Tebex
// to whitelist your project — request approval via your account manager
// before going live.
export class TebexGateway {
  private client: AxiosInstance;

  constructor(projectId: string, privateKey: string) {
    this.client = axios.create({
      baseURL: TEBEX_CHECKOUT_API_URL,
      auth: { username: projectId, password: privateKey },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
  }

  async createCheckout(params: CreateTebexCheckoutParams): Promise<TebexCheckoutResponse> {
    // Tebex prices are in the project's account currency — we still send the
    // amount we computed; if the admin set up the Tebex account in USD but
    // the product is priced in RUB, this will be wrong. The Payment row
    // captures whatever Tebex actually charged from the webhook later.
    const body = {
      basket: {
        // Tebex requires first/last name fields; we only have a Minecraft
        // nickname, so duplicate it into first_name and leave last_name blank.
        first_name: params.nickname,
        last_name: '',
        email: params.email,
        return_url: params.returnUrl,
        complete_url: params.completeUrl,
        custom: {
          payment_id: params.orderId,
          nickname: params.nickname,
        },
      },
      items: [
        {
          package: {
            name: params.productName,
            price: Number(params.amount.toFixed(2)),
            type: 'single',
            qty: 1,
            custom: { payment_id: params.orderId },
          },
        },
      ],
    };

    try {
      const { data } = await this.client.post<TebexCheckoutResponse>('/checkout', body);
      return data;
    } catch (error: any) {
      const detail =
        error.response?.data?.message
        || error.response?.data?.error
        || error.response?.data?.errors?.[0]?.message
        || error.message;
      throw new PaymentError(`Tebex createCheckout failed: ${detail}`, 'TEBEX_CREATE_ERROR');
    }
  }

  // Tebex signs webhooks with HMAC-SHA256 over the *hex SHA256 of the raw
  // body*, using the webhook secret as the HMAC key. The result is compared
  // to the `X-Signature` header. We use the exact bytes Fastify received —
  // re-serialising JSON would change the hash.
  static verifyWebhookSignature(
    rawBody: Buffer | string,
    signatureHex: string | undefined,
    secret: string,
  ): boolean {
    if (!signatureHex || !secret) return false;

    const bodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    const bodyHashHex = createHash('sha256').update(bodyBuffer).digest('hex');
    const expectedHex = createHmac('sha256', secret).update(bodyHashHex).digest('hex');

    // Constant-time compare to avoid signature-timing leaks.
    try {
      const expected = Buffer.from(expectedHex, 'hex');
      const provided = Buffer.from(signatureHex, 'hex');
      if (expected.length !== provided.length) return false;
      return timingSafeEqual(expected, provided);
    } catch {
      return false;
    }
  }
}
