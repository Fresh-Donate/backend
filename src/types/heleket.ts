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
