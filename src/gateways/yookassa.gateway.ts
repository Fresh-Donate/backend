import axios, { type AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { PaymentError } from '@/core/errors';

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

/**
 * YooKassa payment statuses
 * @see https://yookassa.ru/developers/api#payment_object_status
 */
export type YooKassaPaymentStatus =
  | 'pending'
  | 'waiting_for_capture'
  | 'succeeded'
  | 'canceled';

export interface YooKassaAmount {
  value: string;
  currency: string;
}

export interface YooKassaConfirmation {
  type: string;
  confirmation_url?: string;
  return_url?: string;
}

export interface YooKassaPayment {
  id: string;
  status: YooKassaPaymentStatus;
  amount: YooKassaAmount;
  income_amount?: YooKassaAmount;
  description?: string;
  confirmation?: YooKassaConfirmation;
  payment_method?: {
    type: string;
    id?: string;
    saved?: boolean;
    title?: string;
  };
  metadata?: Record<string, string>;
  paid: boolean;
  refundable: boolean;
  created_at: string;
  captured_at?: string;
  expires_at?: string;
}

export interface YooKassaRefund {
  id: string;
  status: 'succeeded' | 'canceled';
  amount: YooKassaAmount;
  payment_id: string;
  created_at: string;
}

export interface CreateYooKassaPaymentParams {
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
  paymentMethodType?: string;
  metadata?: Record<string, string>;
  capture?: boolean;
}

/**
 * YooKassa API Gateway
 * @see https://yookassa.ru/developers/api
 */
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

  /**
   * Create a payment
   * @see https://yookassa.ru/developers/api#create_payment
   */
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

  /**
   * Get payment details
   * @see https://yookassa.ru/developers/api#get_payment
   */
  async getPayment(paymentId: string): Promise<YooKassaPayment> {
    try {
      const { data } = await this.client.get<YooKassaPayment>(`/payments/${paymentId}`);
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.description || error.message;
      throw new PaymentError(`YooKassa getPayment failed: ${msg}`, 'YOOKASSA_GET_ERROR');
    }
  }

  /**
   * Capture a payment (if capture=false was used during creation)
   * @see https://yookassa.ru/developers/api#capture_payment
   */
  async capturePayment(paymentId: string, amount: number, currency: string): Promise<YooKassaPayment> {
    const idempotencyKey = randomUUID();

    try {
      const { data } = await this.client.post<YooKassaPayment>(
        `/payments/${paymentId}/capture`,
        {
          amount: { value: amount.toFixed(2), currency },
        },
        {
          headers: { 'Idempotence-Key': idempotencyKey },
        },
      );
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.description || error.message;
      throw new PaymentError(`YooKassa capturePayment failed: ${msg}`, 'YOOKASSA_CAPTURE_ERROR');
    }
  }

  /**
   * Create a refund
   * @see https://yookassa.ru/developers/api#create_refund
   */
  async createRefund(paymentId: string, amount: number, currency: string): Promise<YooKassaRefund> {
    const idempotencyKey = randomUUID();

    try {
      const { data } = await this.client.post<YooKassaRefund>(
        '/refunds',
        {
          payment_id: paymentId,
          amount: { value: amount.toFixed(2), currency },
        },
        {
          headers: { 'Idempotence-Key': idempotencyKey },
        },
      );
      return data;
    } catch (error: any) {
      const msg = error.response?.data?.description || error.message;
      throw new PaymentError(`YooKassa createRefund failed: ${msg}`, 'YOOKASSA_REFUND_ERROR');
    }
  }

  /**
   * Validate webhook notification signature (IP-based)
   * YooKassa sends notifications from specific IPs:
   * @see https://yookassa.ru/developers/using-api/webhooks
   */
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
