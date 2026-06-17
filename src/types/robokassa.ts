export type RobokassaHashAlgorithm = 'md5' | 'sha256' | 'sha384' | 'sha512';

export type RobokassaCurrency = 'RUB' | 'USD' | 'EUR' | 'KZT';

// 54-ФЗ system of taxation. Robokassa accepts a fixed enum.
export type RobokassaSno =
  | 'osn'
  | 'usn_income'
  | 'usn_income_outcome'
  | 'envd'
  | 'esn'
  | 'patent';

// 54-ФЗ tax rate values per Robokassa fiscalization spec.
export type RobokassaTax =
  | 'none'
  | 'vat0'
  | 'vat10'
  | 'vat110'
  | 'vat20'
  | 'vat120';

// 54-ФЗ "признак способа расчёта" — payment timing.
export type RobokassaPaymentMethod =
  | 'full_prepayment'
  | 'prepayment'
  | 'advance'
  | 'full_payment'
  | 'partial_payment'
  | 'credit'
  | 'credit_payment';

// 54-ФЗ "признак предмета расчёта" — what is being sold.
export type RobokassaPaymentObject =
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
  | 'another';

export interface RobokassaReceiptItem {
  name: string;
  quantity: number;
  sum: number;
  payment_method: RobokassaPaymentMethod;
  payment_object: RobokassaPaymentObject;
  tax: RobokassaTax;
}

export interface RobokassaReceipt {
  sno?: RobokassaSno;
  items: RobokassaReceiptItem[];
}

export interface CreateRobokassaLinkParams {
  amount: number;
  invId: number;
  description: string;
  // ISO 8601 - payment link expires after this moment.
  expirationDate?: string;
  // Customer email - Robokassa puts it into the receipt and pre-fills
  email?: string;
  // OutSumCurrency: if set to a nonRUB code, Robokassa converts the amount
  // to RUB at its current rate for the buyer.
  outSumCurrency?: RobokassaCurrency;
  // 54-ФЗ receipt. When provided, the gateway emits the `Receipt` query
  // parameter and folds its URL-encoded form into the signature string.
  // Omitting it preserves the legacy (non-fiscalized) URL byte-for-byte.
  receipt?: RobokassaReceipt;
  // Custom user parameters; sent as `Shp_<key>=<value>` query params and
  // included in the signature in alphabetical order.
  userParams?: Record<string, string>;
}

export interface RobokassaPaymentLink {
  url: string;
  invId: number;
}

// ResultURL payload (form-urlencoded body from Robokassa).
export interface RobokassaWebhookPayload {
  OutSum?: string;
  InvId?: string;
  SignatureValue?: string;
  Fee?: string;
  EMail?: string;
  PaymentMethod?: string;
  IncCurrLabel?: string;
  // Echoed back verbatim when Receipt was sent on payment creation. Must be
  // re-encoded with encodeURIComponent for signature verification.
  Receipt?: string;
  // Custom Shp_ parameters echo back unchanged.
  [key: string]: string | undefined;
}
