export type RobokassaHashAlgorithm = 'md5' | 'sha256' | 'sha384' | 'sha512';

export type RobokassaCurrency = 'RUB' | 'USD' | 'EUR' | 'KZT';

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
  // Custom Shp_ parameters echo back unchanged.
  [key: string]: string | undefined;
}
