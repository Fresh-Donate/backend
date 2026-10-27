import axios, { type AxiosInstance } from 'axios';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { PaymentError } from '@/core/errors';
import { describeHttpError } from '@/utils/http-error';
import type { RollyPayPayment, CreateRollyPayPaymentParams } from '@/types';

const ROLLYPAY_API_URL = 'https://rollypay.io/api/v1';

const rollyPayError = (body: any) => [body?.error];

export class RollyPayGateway {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: ROLLYPAY_API_URL,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
    this.client.interceptors.request.use((req) => {
      req.headers.set('X-Nonce', randomUUID());
      return req;
    });
  }

  async createPayment(params: CreateRollyPayPaymentParams): Promise<RollyPayPayment> {
    const body: Record<string, unknown> = {
      amount: params.amount.toFixed(2),
      payment_currency: params.currency,
      order_id: params.orderId,
    };

    if (params.currency === 'EUR') body.payment_method = 'intl_card';
    if (params.description) body.description = params.description;
    if (params.successRedirectUrl) body.success_redirect_url = params.successRedirectUrl;
    if (params.failRedirectUrl) body.fail_redirect_url = params.failRedirectUrl;
    if (params.test) body.test = true;

    try {
      const { data } = await this.client.post<RollyPayPayment>('/payments', body);
      return data;
    } catch (error: any) {
      throw new PaymentError(`RollyPay createPayment failed: ${describeHttpError(error, rollyPayError)}`, 'ROLLYPAY_CREATE_ERROR');
    }
  }

  static verifyWebhookSignature(
    rawBody: Buffer | string,
    timestamp: string | undefined,
    signatureHex: string | undefined,
    signingSecret: string,
  ): boolean {
    if (!signatureHex || !timestamp || !signingSecret) return false;

    const expectedHex = createHmac('sha256', signingSecret)
      .update(`${timestamp}.`)
      .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
      .digest('hex');

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
