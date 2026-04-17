import axios, { type AxiosInstance } from 'axios';
import { createHash } from 'node:crypto';
import { PaymentError } from '@/core/errors';

const HELEKET_API_URL = 'https://api.heleket.com/v1';

export interface HeleketPayment {
  uuid: string;
  order_id: string;
  amount: string;
  payer_amount: string;
  payer_currency: string;
  currency: string;
  merchant_amount: string;
  commission: string;
  network: string;
  address: string;
  payment_status: string;
  url: string;
  expired_at: number;
  is_final: boolean;
  created_at: string;
  updated_at: string;
}

export interface HeleketWebhookPayload {
  type: string;
  uuid: string;
  order_id: string;
  amount: string;
  payment_amount: string;
  payment_amount_usd: string;
  merchant_amount: string;
  commission: string;
  is_final: boolean;
  status: string;
  from: string;
  network: string;
  currency: string;
  payer_currency: string;
  additional_data: string | null;
  txid: string;
  sign: string;
}

export interface CreateHeleketPaymentParams {
  amount: number;
  currency: string;
  orderId: string;
  urlReturn?: string;
  urlSuccess?: string;
  urlCallback: string;
  lifetime?: number;
}

/**
 * Heleket Crypto Payment Gateway
 * @see https://docs.heleket.com
 */
export class HeleketGateway {
  private client: AxiosInstance;
  private apiKey: string;
  private merchantId: string;

  constructor(merchantId: string, apiKey: string) {
    this.merchantId = merchantId;
    this.apiKey = apiKey;

    this.client = axios.create({
      baseURL: HELEKET_API_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
  }

  /**
   * Compute Heleket API signature: md5(base64(json_body) + apiKey)
   */
  private sign(body: Record<string, unknown>): string {
    const json = JSON.stringify(body);
    const base64 = Buffer.from(json).toString('base64');
    return createHash('md5').update(base64 + this.apiKey).digest('hex');
  }

  /**
   * Create a payment invoice
   * @see https://docs.heleket.com — POST /v1/payment
   */
  async createPayment(params: CreateHeleketPaymentParams): Promise<HeleketPayment> {
    const body: Record<string, unknown> = {
      amount: params.amount.toFixed(2),
      currency: params.currency,
      order_id: params.orderId,
      url_callback: params.urlCallback,
    };

    if (params.urlReturn) body.url_return = params.urlReturn;
    if (params.urlSuccess) body.url_success = params.urlSuccess;
    if (params.lifetime) body.lifetime = params.lifetime;

    try {
      const { data } = await this.client.post<{ state: number; result: HeleketPayment }>('/payment', body, {
        headers: {
          merchant: this.merchantId,
          sign: this.sign(body),
        },
      });

      if (data.state !== 0) {
        throw new PaymentError(`Heleket returned state ${data.state}`, 'HELEKET_CREATE_ERROR');
      }

      return data.result;
    } catch (error: any) {
      if (error instanceof PaymentError) throw error;
      const msg = error.response?.data?.message || error.message;
      throw new PaymentError(`Heleket createPayment failed: ${msg}`, 'HELEKET_CREATE_ERROR');
    }
  }

  /**
   * Get payment info
   * @see https://docs.heleket.com — POST /v1/payment/info
   */
  async getPayment(uuid: string): Promise<HeleketPayment> {
    const body: Record<string, unknown> = { uuid };

    try {
      const { data } = await this.client.post<{ state: number; result: HeleketPayment }>('/payment/info', body, {
        headers: {
          merchant: this.merchantId,
          sign: this.sign(body),
        },
      });

      return data.result;
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message;
      throw new PaymentError(`Heleket getPayment failed: ${msg}`, 'HELEKET_GET_ERROR');
    }
  }

  /**
   * Verify webhook signature
   * Heleket signs webhooks: sign = md5(base64(json_without_sign_field) + apiKey)
   * Important: forward slashes must be escaped in JSON (PHP behavior)
   */
  verifyWebhookSignature(payload: Record<string, any>): boolean {
    const { sign: receivedSign, ...data } = payload;
    if (!receivedSign) return false;

    // Heleket uses PHP json_encode which escapes forward slashes
    const json = JSON.stringify(data).replace(/\//g, '\\/');
    const base64 = Buffer.from(json).toString('base64');
    const expectedSign = createHash('md5').update(base64 + this.apiKey).digest('hex');

    return receivedSign === expectedSign;
  }

  /**
   * Validate webhook source IP
   */
  static isValidWebhookIp(ip: string): boolean {
    return ip === '31.133.220.8' || ip.startsWith('31.133.220.');
  }
}
