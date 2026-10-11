import axios, { type AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { PaymentError } from '@/core/errors';
import { describeHttpError } from '@/utils/http-error';

const yookassaError = (body: any) => [body?.description];
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
      throw new PaymentError(`YooKassa createPayment failed: ${describeHttpError(error, yookassaError)}`, 'YOOKASSA_CREATE_ERROR');
    }
  }

  async getPayment(paymentId: string): Promise<YooKassaPayment> {
    try {
      const { data } = await this.client.get<YooKassaPayment>(`/payments/${paymentId}`);
      return data;
    } catch (error: any) {
      throw new PaymentError(`YooKassa getPayment failed: ${describeHttpError(error, yookassaError)}`, 'YOOKASSA_GET_ERROR');
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
      throw new PaymentError(`YooKassa capturePayment failed: ${describeHttpError(error, yookassaError)}`, 'YOOKASSA_CAPTURE_ERROR');
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
      throw new PaymentError(`YooKassa createRefund failed: ${describeHttpError(error, yookassaError)}`, 'YOOKASSA_REFUND_ERROR');
    }
  }
}
