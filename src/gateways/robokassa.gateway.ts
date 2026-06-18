import { createHash } from 'node:crypto';
import { PaymentError } from '@/core/errors';
import type {
  CreateRobokassaLinkParams,
  RobokassaHashAlgorithm,
  RobokassaPaymentLink,
  RobokassaReceipt,
  RobokassaWebhookPayload,
} from '@/types';

const ROBOKASSA_PAY_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';

// Robokassa: redirect-only flow. Payments are initiated by pointing the buyer
// at /Merchant/Index.aspx with signed query params; there is no JSON API for
// creating payments. ResultURL is called server-to-server with a signature
// computed from password2 (which must NOT be used for the redirect payload).
export class RobokassaGateway {
  private merchantLogin: string;
  private password1: string;
  private password2: string;
  private testMode: boolean;
  private hashAlgorithm: RobokassaHashAlgorithm;

  constructor(
    merchantLogin: string,
    password1: string,
    password2: string,
    testMode = false,
    hashAlgorithm: RobokassaHashAlgorithm = 'sha256',
  ) {
    this.merchantLogin = merchantLogin;
    this.password1 = password1;
    this.password2 = password2;
    this.testMode = testMode;
    this.hashAlgorithm = hashAlgorithm;
  }

  get isTestMode(): boolean {
    return this.testMode;
  }

  // Robokassa requires InvId to be a positive 32-bit integer unique per
  // merchant. Our payments are UUIDs, so we hash the UUID into a 31-bit int
  // (signed-positive range) and stash the original UUID in Shp_paymentId to
  // recover the payment in the webhook.
  static makeInvId(paymentId: string): number {
    const hex = createHash('sha1').update(paymentId).digest('hex').slice(0, 8);
    const n = parseInt(hex, 16);
    // Keep within signed 32-bit positive range.
    return (n & 0x7fffffff) || 1;
  }

  // Robokassa requires Shp_ params to be appended to the signature input in
  // alphabetical order by key (case-sensitive), as `Shp_<key>=<value>`.
  private static buildShpSegments(userParams: Record<string, string> | undefined): string[] {
    if (!userParams) return [];
    return Object.keys(userParams)
      .sort()
      .map((key) => `Shp_${key}=${userParams[key]}`);
  }

  // Serializes the receipt the way Robokassa expects in the URL: JSON encoded
  // via encodeURIComponent. Keys/order are stable since we own the object.
  // The same encoded form is what must appear in the signature input on both
  // create and webhook verification.
  private static encodeReceipt(receipt: RobokassaReceipt): string {
    const sumFor = (n: number): number => Math.round(n * 100) / 100;
    const normalized = {
      ...(receipt.sno ? { sno: receipt.sno } : {}),
      items: receipt.items.map((i) => ({
        name: i.name.slice(0, 128),
        quantity: i.quantity,
        sum: sumFor(i.sum),
        payment_method: i.payment_method,
        payment_object: i.payment_object,
        tax: i.tax,
      })),
    };
    return encodeURIComponent(JSON.stringify(normalized));
  }

  private hash(input: string): string {
    return createHash(this.hashAlgorithm).update(input).digest('hex').toUpperCase();
  }

  createPaymentLink(params: CreateRobokassaLinkParams): RobokassaPaymentLink {
    if (!this.merchantLogin || !this.password1) {
      throw new PaymentError(
        'Robokassa credentials are not configured',
        'ROBOKASSA_NOT_CONFIGURED',
      );
    }
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new PaymentError('Robokassa amount must be positive', 'ROBOKASSA_CREATE_ERROR');
    }
    if (!Number.isInteger(params.invId) || params.invId <= 0) {
      throw new PaymentError('Robokassa invId must be a positive integer', 'ROBOKASSA_CREATE_ERROR');
    }

    const outSum = params.amount.toFixed(2);
    const shpSegments = RobokassaGateway.buildShpSegments(params.userParams);
    const receiptEncoded = params.receipt
      ? RobokassaGateway.encodeReceipt(params.receipt)
      : undefined;

    // Signature layout per Robokassa docs:
    //   MerchantLogin:OutSum:InvId[:Receipt]:Password1[:Shp_X=Y…]
    // Receipt slot is skipped entirely when not present, preserving the
    // legacy (pre-fiscalization) signature byte-for-byte.
    const signatureInput = [
      this.merchantLogin,
      outSum,
      String(params.invId),
      ...(receiptEncoded ? [receiptEncoded] : []),
      this.password1,
      ...shpSegments,
    ].join(':');
    const signature = this.hash(signatureInput);

    const query = new URLSearchParams();
    query.set('MerchantLogin', this.merchantLogin);
    query.set('OutSum', outSum);
    query.set('InvId', String(params.invId));
    query.set('Description', params.description.slice(0, 100));
    query.set('SignatureValue', signature);
    if (this.testMode) query.set('IsTest', '1');
    if (params.email) query.set('Email', params.email);
    if (params.expirationDate) query.set('ExpirationDate', params.expirationDate);
    if (params.outSumCurrency && params.outSumCurrency !== 'RUB') {
      query.set('OutSumCurrency', params.outSumCurrency);
    }
    if (params.userParams) {
      for (const key of Object.keys(params.userParams).sort()) {
        query.set(`Shp_${key}`, params.userParams[key]);
      }
    }

    let url = `${ROBOKASSA_PAY_URL}?${query.toString()}`;
    if (receiptEncoded) {
      // Append Receipt as the already-encoded string so it matches the
      // signature input exactly. URLSearchParams would re-encode `%` as `%25`.
      url += `&Receipt=${receiptEncoded}`;
    }

    return {
      url,
      invId: params.invId,
    };
  }

  // ResultURL signature: hash(`OutSum:InvId[:Receipt]:Password2[:Shp_X=Y...]`).
  // Receipt is echoed back by Robokassa only when it was sent on create; we
  // detect its presence in the payload and include the re-encoded value in
  // the signature input the same way as on create. Payments created before
  // fiscalization was enabled will hit the no-Receipt branch and verify
  // against the legacy signature format.
  verifyWebhookSignature(payload: RobokassaWebhookPayload): boolean {
    const received = payload.SignatureValue;
    if (!received || !payload.OutSum || !payload.InvId) return false;
    if (!this.password2) return false;

    const shpParams: Record<string, string> = {};
    for (const key of Object.keys(payload)) {
      if (key.startsWith('Shp_')) {
        const value = payload[key];
        if (typeof value === 'string') shpParams[key.slice(4)] = value;
      }
    }
    const shpSegments = RobokassaGateway.buildShpSegments(shpParams);
    const receiptEncoded = RobokassaGateway.reencodeReceiptFromPayload(payload.Receipt);

    const input = [
      payload.OutSum,
      payload.InvId,
      ...(receiptEncoded ? [receiptEncoded] : []),
      this.password2,
      ...shpSegments,
    ].join(':');
    const expected = this.hash(input);

    return received.toUpperCase() === expected;
  }

  verifySuccessSignature(payload: RobokassaWebhookPayload): boolean {
    const received = payload.SignatureValue;
    if (!received || !payload.OutSum || !payload.InvId) return false;
    if (!this.password1) return false;

    const shpParams: Record<string, string> = {};
    for (const key of Object.keys(payload)) {
      if (key.startsWith('Shp_')) {
        const value = payload[key];
        if (typeof value === 'string') shpParams[key.slice(4)] = value;
      }
    }
    const shpSegments = RobokassaGateway.buildShpSegments(shpParams);
    const receiptEncoded = RobokassaGateway.reencodeReceiptFromPayload(payload.Receipt);

    const input = [
      payload.OutSum,
      payload.InvId,
      ...(receiptEncoded ? [receiptEncoded] : []),
      this.password1,
      ...shpSegments,
    ].join(':');
    const expected = this.hash(input);

    return received.toUpperCase() === expected;
  }

  // When Fastify parses the form-urlencoded webhook body it already decodes
  // Receipt back to JSON. To reconstruct the signature input we must re-apply
  // encodeURIComponent. Returns undefined when Receipt isn't present, which
  // routes the verifier to the legacy signature format.
  private static reencodeReceiptFromPayload(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    return encodeURIComponent(raw);
  }
}
