// CryptoBot (Crypto Pay API by @CryptoBot on Telegram).
// Docs: https://help.crypt.bot/crypto-pay-api

export type CryptoBotAsset =
  | 'USDT' | 'TON' | 'BTC' | 'ETH' | 'LTC' | 'BNB' | 'TRX' | 'USDC';

export type CryptoBotFiat = 'USD' | 'EUR' | 'RUB' | 'BYN' | 'UAH' | 'GBP' | 'CNY'
  | 'KZT' | 'UZS' | 'GEL' | 'TRY' | 'AMD' | 'THB' | 'INR' | 'BRL' | 'IDR'
  | 'AZN' | 'AED' | 'PLN' | 'ILS';

export type CryptoBotInvoiceStatus = 'active' | 'paid' | 'expired';

export interface CryptoBotInvoice {
  invoice_id: number;
  hash: string;
  currency_type: 'crypto' | 'fiat';
  asset?: CryptoBotAsset;
  fiat?: CryptoBotFiat;
  amount: string;
  paid_asset?: CryptoBotAsset;
  paid_amount?: string;
  paid_fiat_rate?: string;
  accepted_assets?: CryptoBotAsset[];
  fee_asset?: CryptoBotAsset;
  fee_amount?: number;
  /** @deprecated Use bot_invoice_url / mini_app_invoice_url / web_app_invoice_url */
  pay_url?: string;
  bot_invoice_url?: string;
  mini_app_invoice_url?: string;
  web_app_invoice_url?: string;
  description?: string;
  status: CryptoBotInvoiceStatus;
  swap_to?: CryptoBotAsset | CryptoBotFiat;
  is_swapped?: boolean;
  swapped_uid?: string;
  swapped_to?: string;
  swapped_rate?: string;
  swapped_output?: string;
  swapped_usd_amount?: string;
  swapped_usd_rate?: string;
  created_at: string;
  paid_usd_rate?: string;
  usd_rate?: string;
  allow_comments?: boolean;
  allow_anonymous?: boolean;
  expiration_date?: string;
  paid_at?: string;
  paid_anonymously?: boolean;
  comment?: string;
  hidden_message?: string;
  payload?: string;
  paid_btn_name?: string;
  paid_btn_url?: string;
}

export interface CryptoBotApiResponse<T> {
  ok: boolean;
  result?: T;
  error?: {
    code: number;
    name?: string;
  };
}

export interface CryptoBotWebhookUpdate {
  update_id: number;
  update_type: 'invoice_paid';
  request_date: string;
  payload: CryptoBotInvoice;
}

export interface CreateCryptoBotInvoiceParams {
  /** Default 'fiat' — buyer enters a fiat amount, pays in any supported crypto. */
  currencyType?: 'crypto' | 'fiat';
  /** Required when currencyType === 'crypto'. */
  asset?: CryptoBotAsset;
  /** Required when currencyType === 'fiat'. */
  fiat?: CryptoBotFiat;
  amount: number;
  description?: string;
  hiddenMessage?: string;
  /** Restrict accepted assets when currencyType === 'fiat'. */
  acceptedAssets?: CryptoBotAsset[];
  /** Free-form string we use to round-trip our internal payment.id (≤4096 bytes). */
  payload?: string;
  paidBtnName?: 'viewItem' | 'openChannel' | 'openBot' | 'callback';
  paidBtnUrl?: string;
  allowComments?: boolean;
  allowAnonymous?: boolean;
  /** Seconds, 1..2678400 (31 days). */
  expiresIn?: number;
}
