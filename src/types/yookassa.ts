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
