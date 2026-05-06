export type WataStatus = 'Created' | 'Pending' | 'Paid' | 'Declined';

export interface WataPaymentLink {
  id: string;
  amount: number;
  currency: string;
  orderId?: string;
  description?: string;
  url: string;
  status: WataStatus;
  creationTime?: string;
  expirationDateTime?: string;
  successRedirectUrl?: string;
  failRedirectUrl?: string;
}

export interface WataTransaction {
  id: string;
  paymentLinkId?: string;
  orderId?: string;
  status: WataStatus;
  amount: number;
  currency: string;
  paymentTime?: string;
  errorCode?: string;
  errorDescription?: string;
}

export interface WataWebhookPayload {
  transactionId?: string;
  paymentLinkId?: string;
  orderId?: string;
  transactionStatus?: WataStatus;
  status?: WataStatus;
  amount?: number;
  currency?: string;
  paymentTime?: string;
  errorCode?: string;
  errorDescription?: string;
  [key: string]: unknown;
}

export interface CreateWataLinkParams {
  amount: number;
  currency: 'RUB' | 'EUR' | 'USD';
  orderId: string;
  description?: string;
  successRedirectUrl?: string;
  failRedirectUrl?: string;
  expirationDateTime?: string;
}
