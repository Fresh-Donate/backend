export type RollyPayStatus =
  | 'created'
  | 'processing'
  | 'paid'
  | 'expired'
  | 'canceled'
  | 'chargeback'
  | 'refunded';

export type RollyPayCurrency = 'RUB' | 'EUR';

export interface RollyPayPayment {
  payment_id: string;
  order_id: string;
  status: RollyPayStatus;
  token?: string;
  pay_url: string;
  amount: string;
  payment_currency: RollyPayCurrency;
  created_at?: string;
  expires_at?: string;
  paid_at?: string;
  test?: boolean;
}

export interface RollyPayWebhookPayload {
  event_type?: string;
  payment_id?: string;
  order_id?: string;
  status?: RollyPayStatus;
  amount?: string;
  currency?: string;
  test?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateRollyPayPaymentParams {
  amount: number;
  currency: RollyPayCurrency;
  orderId: string;
  description?: string;
  successRedirectUrl?: string;
  failRedirectUrl?: string;
  test?: boolean;
}
