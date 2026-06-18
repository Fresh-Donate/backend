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

// 54-ФЗ vat codes per YooKassa spec.
// 1=без НДС, 2=НДС 0%, 3=НДС 10%, 4=НДС 20%, 5=НДС 10/110, 6=НДС 20/120.
export type YooKassaVatCode = 1 | 2 | 3 | 4 | 5 | 6;

export type YooKassaPaymentMode =
  | 'full_prepayment'
  | 'partial_prepayment'
  | 'advance'
  | 'full_payment'
  | 'partial_payment'
  | 'credit'
  | 'credit_payment';

export type YooKassaPaymentSubject =
  | 'commodity'
  | 'excise'
  | 'job'
  | 'service'
  | 'gambling_bet'
  | 'gambling_prize'
  | 'lottery'
  | 'lottery_prize'
  | 'intellectual_activity'
  | 'payment'
  | 'agent_commission'
  | 'composite'
  | 'another'
  | 'property_right'
  | 'non_operating_gain'
  | 'insurance_premium'
  | 'sales_tax'
  | 'resort_fee';

export interface YooKassaReceiptItem {
  description: string;
  quantity: string;
  amount: YooKassaAmount;
  vat_code: YooKassaVatCode;
  payment_mode: YooKassaPaymentMode;
  payment_subject: YooKassaPaymentSubject;
}

export interface YooKassaReceipt {
  customer: { email?: string; phone?: string };
  items: YooKassaReceiptItem[];
}

export interface CreateYooKassaPaymentParams {
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
  paymentMethodType?: string;
  metadata?: Record<string, string>;
  capture?: boolean;
  // 54-ФЗ receipt. When provided, sent to YooKassa as the top-level `receipt`
  // field. Omitting it preserves the legacy payment-create body.
  receipt?: YooKassaReceipt;
}
