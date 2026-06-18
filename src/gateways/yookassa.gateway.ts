import axios, { type AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { PaymentError } from '@/core/errors';
import type {
  YooKassaPayment,
  YooKassaRefund,
  CreateYooKassaPaymentParams,
} from '@/types';

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

export class YooKassaGateway {
  private client: AxiosInstance;

  constructor(shopId: string, secretKey: string) {
    this.client = axios.create({
      baseURL: YOOKASSA_API_URL,
      auth: { username: shopId, password: secretKey },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
  }

  async createPayment(params: CreateYooKassaPaymentParams): Promise<YooKassaPayment> {
    const idempotencyKey = randomUUID();

    const body: Record<string, unknown> = {
      amount: {
        value: params.amount.toFixed(2),
        currency: params.currency,
      },
      capture: params.capture ?? true,
      confirmation: {
        type: 'redirect',
        return_url: params.returnUrl,
      },
      description: params.description,
      metadata: params.metadata,
    };

    if (params.paymentMethodType) {
      body.payment_method_data = {
        type: params.paymentMethodType,
      };
    }

    if (params.receipt) {
      body.receipt = params.receipt;
    }

    try {
      const { data } = await this.client.post<YooKassaPayment>('/payments', body, {
        headers: { 'Idempotence-Key': idempotencyKey },
      });
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.description || error.message;
      throw new PaymentError(`YooKassa createPayment failed: ${msg}`, 'YOOKASSA_CREATE_ERROR');
    }
  }

  async getPayment(paymentId: string): Promise<YooKassaPayment> {
    try {
      const { data } = await this.client.get<YooKassaPayment>(`/payments/${paymentId}`);
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.description || error.message;
      throw new PaymentError(`YooKassa getPayment failed: ${msg}`, 'YOOKASSA_GET_ERROR');
    }
  }

  async capturePayment(paymentId: string, amount: number, currency: string): Promise<YooKassaPayment> {
    const idempotencyKey = randomUUID();

    try {
      const { data } = await this.client.post<YooKassaPayment>(
        `/payments/${paymentId}/capture`,
        { amount: { value: amount.toFixed(2), currency } },
        { headers: { 'Idempotence-Key': idempotencyKey } },
      );
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.description || error.message;
      throw new PaymentError(`YooKassa capturePayment failed: ${msg}`, 'YOOKASSA_CAPTURE_ERROR');
    }
  }

  async createRefund(paymentId: string, amount: number, currency: string): Promise<YooKassaRefund> {
    const idempotencyKey = randomUUID();

    try {
      const { data } = await this.client.post<YooKassaRefund>(
        '/refunds',
        {
          payment_id: paymentId,
          amount: { value: amount.toFixed(2), currency },
        },
        { headers: { 'Idempotence-Key': idempotencyKey } },
      );
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.description || error.message;
      throw new PaymentError(`YooKassa createRefund failed: ${msg}`, 'YOOKASSA_REFUND_ERROR');
    }
  }

  // YooKassa webhooks come from a fixed set of IPs (no signing) -
  // see https://yookassa.ru/developers/using-api/webhooks
  static isValidWebhookIp(ip: string): boolean {
    const allowedCidrs = [
      '185.71.76.',
      '185.71.77.',
      '77.75.153.',
      '77.75.156.',
      '77.75.157.',
      '2a02:5180:',
    ];
    return allowedCidrs.some((cidr) => ip.startsWith(cidr));
  }
}
