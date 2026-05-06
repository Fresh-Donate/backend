import axios, { type AxiosInstance } from 'axios';
import { createHash } from 'node:crypto';
import { PaymentError } from '@/core/errors';
import type { HeleketPayment, CreateHeleketPaymentParams } from '@/types';

const HELEKET_API_URL = 'https://api.heleket.com/v1';

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

  // Heleket signature: md5(base64(json_body) + apiKey).
  private sign(body: Record<string, unknown>): string {
    const json = JSON.stringify(body);
    const base64 = Buffer.from(json).toString('base64');
    return createHash('md5').update(base64 + this.apiKey).digest('hex');
  }

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

  // Heleket signs webhooks with PHP json_encode, which escapes forward slashes —
  // we must replicate that escape to match the signature.
  verifyWebhookSignature(payload: Record<string, any>): boolean {
    const { sign: receivedSign, ...data } = payload;
    if (!receivedSign) return false;

    const json = JSON.stringify(data).replace(/\//g, '\\/');
    const base64 = Buffer.from(json).toString('base64');
    const expectedSign = createHash('md5').update(base64 + this.apiKey).digest('hex');

    return receivedSign === expectedSign;
  }

  static isValidWebhookIp(ip: string): boolean {
    return ip === '31.133.220.8' || ip.startsWith('31.133.220.');
  }
}
