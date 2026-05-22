// Tebex Headless API — https://docs.tebex.io/developers/headless-api/overview
// We can't pass arbitrary prices: every line item must reference a Package
// already created in the Tebex Dashboard. To handle dynamic totals we keep a
// set of "coin" packages (0.01 / 0.1 / 1 / 10 / 100 / 1000 in the account
// currency) and decompose the amount across them greedily.

export interface TebexBasketResponse {
  data: {
    id?: string;
    ident: string;
    complete?: boolean;
    email?: string | null;
    username?: string | null;
    base_price?: number;
    sales_tax?: number;
    total_price?: number;
    currency?: string;
    packages?: Array<{ qty: number; type: string }>;
    custom?: Record<string, unknown> | null;
    links: {
      checkout: string;
      [key: string]: string;
    };
  };
}

export interface CreateTebexBasketParams {
  paymentId: string;
  completeUrl: string;
  cancelUrl: string;
}

export interface TebexCoinPlan {
  packageId: string;
  quantity: number;
  denomination: number;
}

// Webhook envelope. Tebex wraps every event as { id, type, date, subject }.
// `subject` for payment.* events is a transaction object; for the one-shot
// `validation.webhook` (sent when the endpoint is first configured in their
// panel) the subject is absent.
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
  // basket.custom is echoed here — we stash our payment.id there at basket
  // creation, then look it up here to find the right Payment row.
  custom?: Record<string, unknown> | null;
  decline_reason?: {
    code?: string;
    message?: string;
  };
  settled_at?: string;
}
