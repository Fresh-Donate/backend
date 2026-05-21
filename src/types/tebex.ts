// Tebex Checkout API — https://docs.tebex.io/developers/checkout-api/overview
// One-shot endpoint that creates a basket + items + sale in a single call.
// Returns a checkout URL the buyer is redirected to.

export interface TebexCheckoutResponse {
  ident: string;
  returnUrl: string;
}

export interface CreateTebexCheckoutParams {
  // Our payment.id — round-trips back via webhook in basket.custom.payment_id.
  orderId: string;
  amount: number;
  // Tebex uses the account's configured currency — passing this for parity
  // with other gateways, but Tebex will silently use its own.
  currency: string;
  productName: string;
  nickname: string;
  email: string;
  returnUrl: string;
  completeUrl: string;
}

// Webhook envelope. Tebex wraps all events as { id, type, date, subject }.
// `subject` shape depends on `type` — for payment.* it's a transaction object,
// for validation.webhook it's empty.
export interface TebexWebhookEnvelope {
  id: string;
  type: string;
  date: string;
  subject?: TebexTransactionSubject;
}

export interface TebexTransactionSubject {
  transaction_id: string;
  status?: {
    id: number;
    description: string;
  };
  payment_sequence?: string;
  created_at?: string;
  price?: {
    amount: number;
    currency: string;
  };
  price_paid?: {
    amount: number;
    currency: string;
  };
  payment_method?: {
    name: string;
    refundable: boolean;
  };
  fees?: {
    tax?: { amount: number; currency: string };
    gateway?: { amount: number; currency: string };
  };
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    ip?: string;
    username?: {
      id?: string;
      username?: string;
    };
    country?: string;
  };
  products?: Array<{
    id: number | string;
    name: string;
    quantity: number;
    base_price?: { amount: number; currency: string };
    paid_price?: { amount: number; currency: string };
    custom?: Record<string, unknown> | null;
  }>;
  // basket.custom is echoed here on most payloads — that's where we put our
  // payment.id at checkout creation, used to look up the right Payment.
  custom?: Record<string, unknown> | null;
  decline_reason?: {
    code?: string;
    message?: string;
  };
  settled_at?: string;
}
