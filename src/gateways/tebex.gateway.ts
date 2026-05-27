import axios, { type AxiosInstance } from 'axios';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentError } from '@/core/errors';
import {
  decomposeAmount,
  missingCoinDenominations,
  type CoinPackagesMap,
} from '@/utils/coin-decomposition';
import type {
  TebexBasketResponse,
  CreateTebexBasketParams,
} from '@/types';

const TEBEX_HEADLESS_API_URL = 'https://headless.tebex.io/api';

// Tebex Headless API: low-level endpoints to build a basket from existing
// catalogue packages, returning a checkout URL. Auth = HTTP Basic over the
// webstore's public token (username) and the project's private key
// (password) from developer settings in tebex.io.
//
// We can't pass arbitrary prices, so the admin pre-creates a small set of
// "coin" packages (see utils/coin-decomposition) and we assemble the target
// amount from them greedily.
export class TebexGateway {
  private client: AxiosInstance;
  private webstoreToken: string;

  constructor(webstoreToken: string, privateKey: string) {
    this.webstoreToken = webstoreToken;
    this.client = axios.create({
      baseURL: TEBEX_HEADLESS_API_URL,
      auth: { username: webstoreToken, password: privateKey },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
  }

  async createBasket(params: CreateTebexBasketParams): Promise<TebexBasketResponse['data']> {
    const body: Record<string, unknown> = {
      complete_url: params.completeUrl,
      cancel_url: params.cancelUrl,
      complete_auto_redirect: true,
      custom: { payment_id: params.paymentId },
      // Required for Tebex
      username: params.username,
      ip_address: extractIPv4(params.ipAddress),
    };

    try {
      const { data } = await this.client.post<TebexBasketResponse>(
        `/accounts/${this.webstoreToken}/baskets`,
        body,
      );
      return data.data;
    } catch (error: any) {
      const detail = this.extractErrorMessage(error);
      throw new PaymentError(`Tebex createBasket failed: ${detail}`, 'TEBEX_CREATE_BASKET_ERROR');
    }
  }

  async addPackage(basketIdent: string, packageId: string, quantity: number): Promise<void> {
    try {
      await this.client.post(`/baskets/${basketIdent}/packages`, {
        package_id: packageId,
        quantity,
      });
    } catch (error: any) {
      const detail = this.extractErrorMessage(error);
      throw new PaymentError(
        `Tebex addPackage failed (basket=${basketIdent} pkg=${packageId} qty=${quantity}): ${detail}`,
        'TEBEX_ADD_PACKAGE_ERROR',
      );
    }
  }

  /**
   * High-level helper: create a basket, decompose `amount` across the
   * coin-packages map, push each line to the basket, return checkout URL +
   * the basket ident (used as `externalPaymentId`).
   *
   * Throws `TEBEX_COINS_NOT_CONFIGURED` if any of the six denominations is
   * missing from the map — better to fail loudly at checkout creation than
   * to charge a partial amount.
   */
  async createCheckout(params: {
    amount: number;
    paymentId: string;
    completeUrl: string;
    cancelUrl: string;
    coinPackages: CoinPackagesMap;
    username: string;
    ipAddress: string;
  }): Promise<{ ident: string; checkoutUrl: string }> {
    const missing = missingCoinDenominations(params.coinPackages);
    if (missing.length > 0) {
      throw new PaymentError(
        `Tebex coin packages not configured for denominations: ${missing.join(', ')}. Create them in the Tebex Dashboard and paste their package IDs in the provider settings.`,
        'TEBEX_COINS_NOT_CONFIGURED',
      );
    }

    const plan = decomposeAmount(params.amount, params.coinPackages);
    if (plan.length === 0) {
      throw new PaymentError(
        `Tebex decomposition produced no items for amount ${params.amount}. Amount is too small for the configured denominations.`,
        'TEBEX_DECOMPOSITION_EMPTY',
      );
    }

    const basket = await this.createBasket({
      paymentId: params.paymentId,
      completeUrl: params.completeUrl,
      cancelUrl: params.cancelUrl,
      username: params.username,
      ipAddress: params.ipAddress,
    });

    // Sequential — Tebex doesn't document a bulk-add endpoint and parallel
    // POSTs to the same basket would race the server-side total.
    for (const line of plan) {
      await this.addPackage(basket.ident, line.packageId, line.quantity);
    }

    if (!basket.links?.checkout) {
      throw new PaymentError('Tebex basket returned without a checkout URL', 'TEBEX_NO_CHECKOUT_URL');
    }

    return { ident: basket.ident, checkoutUrl: basket.links.checkout };
  }

  // Tebex signs webhooks with HMAC-SHA256 over the *hex SHA256 of the raw
  // body*, using the webhook secret as the HMAC key. Compared to the
  // `X-Signature` header. We use the exact bytes Fastify received —
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

    try {
      const expected = Buffer.from(expectedHex, 'hex');
      const provided = Buffer.from(signatureHex, 'hex');
      if (expected.length !== provided.length) return false;
      return timingSafeEqual(expected, provided);
    } catch {
      return false;
    }
  }

  private extractErrorMessage(error: any): string {
    return (
      error.response?.data?.detail
      || error.response?.data?.message
      || error.response?.data?.error
      || error.response?.data?.errors?.[0]?.detail
      || error.response?.data?.errors?.[0]?.message
      || error.message
    );
  }
}

// Tebex insists on a plain IPv4. Strip the IPv4-mapped IPv6 prefix
// (`::ffff:1.2.3.4` — what Node hands us when the socket is dual-stack)
// and fall through to a placeholder for pure IPv6, which Tebex would
// reject outright otherwise.
function extractIPv4(ip: string | undefined | null): string {
  if (!ip) return '0.0.0.0';
  const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return mapped[1]!;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return ip;
  return '0.0.0.0';
}
