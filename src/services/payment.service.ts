import { Payment, type PaymentStatus } from '@/models/payment.model';
import { Product } from '@/models/product.model';
import { Promotion } from '@/models/promotion.model';
import { Group } from '@/models/group.model';
import { PaymentOption } from '@/models/payment-option.model';
import { PaymentProvider } from '@/models/payment-provider.model';
import { CustomerService } from './customer.service';
import { SettingsService } from './settings.service';
import { DeliveryService } from './delivery.service';
import { EmailService } from './email.service';
import { PaymentExpirationService } from './payment-expiration.service';
import { UpgradePricingService } from './upgrade-pricing.service';
import {
  activePromotionsAt,
  applyDiscount,
  totalDiscountPercent,
} from './promotion.service';
import { NotFoundError, ValidationError, PaymentError } from '@/core';
import { Op, fn, col, literal } from 'sequelize';
import { YooKassaGateway } from '@/gateways/yookassa.gateway';
import { HeleketGateway } from '@/gateways/heleket.gateway';
import { WataGateway } from '@/gateways/wata.gateway';
import { TebexGateway } from '@/gateways/tebex.gateway';
import { CryptoBotGateway } from '@/gateways/cryptobot.gateway';
import { RobokassaGateway } from '@/gateways/robokassa.gateway';
import { config } from '@/config';
import { buildAmountInTargetSql, convert, toBaseCurrency, isSupportedCurrency } from '@/utils/currency';
import type {
  PaymentDto,
  CreatePaymentDto,
  UpgradeEvaluation,
  WataWebhookPayload,
  RobokassaWebhookPayload,
  RobokassaHashAlgorithm,
  TebexWebhookEnvelope,
  CryptoBotWebhookUpdate,
  CryptoBotFiat,
  StatsSummary,
} from '@/types';

function toDto(p: Payment): PaymentDto {
  return {
    id: p.id,
    customerNickname: p.customerNickname,
    customerEmail: p.customerEmail,
    productId: p.productId,
    productName: p.productName,
    productPrice: Number(p.productPrice),
    productCurrency: p.productCurrency || p.currency,
    currency: p.currency,
    quantity: p.quantity,
    totalAmount: Number(p.totalAmount),
    commissionPercent: Number(p.commissionPercent),
    commissionAmount: Number(p.commissionAmount),
    providerAmount: Number(p.providerAmount),
    status: p.status,
    paymentOptionId: p.paymentOptionId,
    providerId: p.providerId,
    externalPaymentId: p.externalPaymentId,
    externalPaymentUrl: p.externalPaymentUrl,
    paidAt: p.paidAt?.toISOString() || null,
    deliveredAt: p.deliveredAt?.toISOString() || null,
    meta: p.meta,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    userSelectedCount: p.userSelectedCount,
  };
}

// Idempotency cache: same (nickname, product, count) request within 2 min
// returns the existing pending payment instead of double-charging.
const paymentCache = new Map<string, { paymentId: string; expiresAt: number }>();
const CACHE_TTL = 2 * 60 * 1000;

function getCacheKey(nickname: string, productKey: string): string {
  return `${nickname}:${productKey}`;
}

export class PaymentService {
  private customerService = new CustomerService();
  private settingsService = new SettingsService();
  private deliveryService = new DeliveryService();
  private emailService = new EmailService();
  private expirationService = new PaymentExpirationService();
  private upgradePricingService = new UpgradePricingService();

  // Single fan-out point for "payment just transitioned to paid": fire the
  // receipt email (best-effort, never blocks) and then kick off delivery.
  // Webhooks and demo-mode all go through here so behaviour stays uniform.
  private async onPaymentPaid(paymentId: string): Promise<void> {
    void this.emailService.sendPurchaseConfirmation(paymentId).catch(() => {});
    await this.deliveryService.attemptDelivery(paymentId);
  }

  async previewPrice(nickname: string, productId: string): Promise<UpgradeEvaluation> {
    return this.upgradePricingService.evaluate(nickname, productId);
  }

  async create(data: CreatePaymentDto): Promise<PaymentDto> {
    const product = await Product.findByPk(data.productId, {
      include: [
        { model: Promotion, through: { attributes: [] }, required: false },
        { model: Group, through: { attributes: [] }, required: false },
      ],
    });
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Privilege products are rank-style - count is always 1, ignoring whatever
    // the client sent. Other products honour custom-count when allowed.
    const isPrivilege = product.type === 'privilege';
    const count = isPrivilege
      ? 1
      : product.allowCustomCount
        ? Math.max(1, Math.floor(Number(data.count) || 1))
        : 1;

    if (!product.allowCustomCount && !isPrivilege && count !== 1) {
      throw new ValidationError('This product does not support custom count');
    }

    const cacheKey = getCacheKey(data.nickname, `${data.productId}_${count}`);
    const cached = paymentCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const existing = await Payment.findByPk(cached.paymentId);
      if (existing && existing.status === 'pending') {
        return toDto(existing);
      }
      paymentCache.delete(cacheKey);
    }

    const option = await PaymentOption.findByPk(data.paymentOptionId);
    if (!option) {
      throw new ValidationError('Payment option not found');
    }

    const provider = await PaymentProvider.findOne({ where: { providerId: option.providerId } });

    const settings = await this.settingsService.get();
    if (!settings.demo_payments) {
      if (!provider) {
        throw new ValidationError(`Payment provider "${option.providerId}" not found`);
      }
      if (!provider.enabled) {
        throw new PaymentError(
          `Payment provider "${provider.name}" is not enabled. Enable it in admin panel.`,
          'PROVIDER_DISABLED',
        );
      }
    }

    // Pricing order: promo → upgrade "доплата" → multiply by count. Same
    // evaluator as /preview, so what the modal showed is what we charge.
    const upgradeEval = await this.upgradePricingService.evaluate(data.nickname, product.id);
    if (upgradeEval.blocked) {
      throw new ValidationError(
        upgradeEval.reference
          ? `Этот товар нельзя купить - на нике "${data.nickname}" уже есть "${upgradeEval.reference.productName}" из этой группы.`
          : 'Этот товар уже куплен на указанном нике.',
      );
    }

    const activePromos = activePromotionsAt(product.promotions);
    const stackedPercent = totalDiscountPercent(activePromos);
    const discountedUnit = applyDiscount(Number(product.price), stackedPercent);
    const finalUnit = upgradeEval.upgradeDiscount > 0
      ? Math.max(0, Math.round((discountedUnit - upgradeEval.upgradeDiscount) * 100) / 100)
      : discountedUnit;
    const productPrice = Math.round(finalUnit * count * 100) / 100;
    const productCurrency = product.currency;
    let paymentCurrency = productCurrency;
    let chargedPrice = productPrice;
    let commissionPercent = 0;
    let commissionAmount = 0;
    let totalAmount = productPrice;
    let providerAmount = productPrice;

    if (provider) {
      if (provider.supportedCurrencies.length > 0) {
        paymentCurrency = provider.supportedCurrencies.includes(productCurrency)
          ? productCurrency
          : provider.supportedCurrencies[0];
      }

      chargedPrice = paymentCurrency === productCurrency
        ? productPrice
        : Math.round(
          convert(productPrice, productCurrency, paymentCurrency, settings.currency_rates, settings.base_currency) * 100,
        ) / 100;

      const minAmount = Number(provider.minAmount) || 0;
      if (minAmount > 0) {
        const chargedInBase = toBaseCurrency(
          chargedPrice,
          paymentCurrency,
          settings.currency_rates,
          settings.base_currency,
        );
        if (chargedInBase + 1e-9 < minAmount) {
          throw new ValidationError(
            `Минимальная сумма для оплаты через ${provider.name} - ${minAmount} ${settings.base_currency}.`,
          );
        }
      }

      commissionPercent = Number(provider.commissionPercent) || 0;
      commissionAmount = Math.round(chargedPrice * commissionPercent) / 100;

      const rule = provider.commissionRule;
      if (rule.mode === 'buyer') {
        totalAmount = chargedPrice + commissionAmount;
        providerAmount = chargedPrice;
      } else if (rule.mode === 'split') {
        const buyerShare = Math.round(commissionAmount * 50) / 100;
        totalAmount = chargedPrice + buyerShare;
        providerAmount = chargedPrice - (commissionAmount - buyerShare);
      } else {
        totalAmount = chargedPrice;
        providerAmount = chargedPrice - commissionAmount;
      }
    }

    const payment = await Payment.create({
      customerNickname: data.nickname,
      customerEmail: data.email,
      productId: product.id,
      productName: product.name,
      productPrice,
      productCurrency,
      currency: paymentCurrency,
      quantity: product.quantity,
      totalAmount,
      commissionPercent,
      commissionAmount,
      providerAmount,
      paymentOptionId: data.paymentOptionId,
      status: 'pending',
      userSelectedCount: count,
    });

    if (settings.demo_payments) {
      await payment.update({
        status: 'paid',
        paidAt: new Date(),
        meta: { demo: true },
      });

      await this.onPaymentPaid(payment.id);

      const result = await Payment.findByPk(payment.id);
      if (!result) throw new Error('Payment vanished after creation');
      return toDto(result);
    }

    paymentCache.set(cacheKey, {
      paymentId: payment.id,
      expiresAt: Date.now() + CACHE_TTL,
    });

    if (provider && provider.enabled) {
      await this.createExternalPayment(payment, provider, product.name, data.customerIp);
    }

    const result = await Payment.findByPk(payment.id);
    if (!result) throw new Error('Payment vanished after creation');
    return toDto(result);
  }

  private async createExternalPayment(
    payment: Payment,
    provider: InstanceType<typeof PaymentProvider>,
    productName: string,
    customerIp: string | undefined,
  ): Promise<void> {
    if (provider.providerId === 'yookassa') {
      const { shopId, secretKey } = provider.credentials;
      if (!shopId || !secretKey) {
        throw new PaymentError(
          'YooKassa credentials not configured. Set shopId and secretKey in payment provider settings.',
          'YOOKASSA_NOT_CONFIGURED',
        );
      }

      const gateway = new YooKassaGateway(shopId, secretKey);
      const returnUrl = config.payment.returnUrl;

      const yooPayment = await gateway.createPayment({
        amount: Number(payment.totalAmount),
        currency: payment.currency,
        description: `${productName} - FreshDonate`,
        returnUrl: `${returnUrl}?paymentId=${payment.id}`,
        metadata: {
          payment_id: payment.id,
          customer_nickname: payment.customerNickname,
          product_id: payment.productId,
        },
      });

      await payment.update({
        providerId: provider.providerId,
        externalPaymentId: yooPayment.id,
        externalPaymentUrl: yooPayment.confirmation?.confirmation_url || null,
      });
    } else if (provider.providerId === 'heleket') {
      const { apiKey, merchantId } = provider.credentials;
      if (!apiKey || !merchantId) {
        throw new PaymentError(
          'Heleket credentials not configured. Set apiKey and merchantId in payment provider settings.',
          'HELEKET_NOT_CONFIGURED',
        );
      }

      const gateway = new HeleketGateway(merchantId, apiKey);
      const returnUrl = config.payment.returnUrl;
      const webhookUrl = `${config.payment.webhookBaseUrl}/webhooks/heleket`;

      const heleketPayment = await gateway.createPayment({
        amount: Number(payment.totalAmount),
        currency: payment.currency,
        orderId: payment.id,
        urlReturn: `${returnUrl}?paymentId=${payment.id}`,
        urlSuccess: `${returnUrl}?paymentId=${payment.id}`,
        urlCallback: webhookUrl,
      });

      await payment.update({
        providerId: provider.providerId,
        externalPaymentId: heleketPayment.uuid,
        externalPaymentUrl: heleketPayment.url,
      });
    } else if (provider.providerId === 'wata') {
      const { apiKey } = provider.credentials;
      if (!apiKey) {
        throw new PaymentError(
          'Wata credentials not configured. Set apiKey in payment provider settings.',
          'WATA_NOT_CONFIGURED',
        );
      }

      const currency = payment.currency as 'RUB' | 'USD' | 'EUR';
      const gateway = new WataGateway(apiKey, provider.testMode);
      const returnUrl = config.payment.returnUrl;

      const wataLink = await gateway.createPaymentLink({
        amount: Number(payment.totalAmount),
        currency,
        orderId: payment.id,
        description: `${productName} - FreshDonate`,
        successRedirectUrl: `${returnUrl}?paymentId=${payment.id}`,
        failRedirectUrl: `${returnUrl}?paymentId=${payment.id}&failed=1`,
      });

      await payment.update({
        providerId: provider.providerId,
        externalPaymentId: wataLink.id,
        externalPaymentUrl: wataLink.url,
        meta: {
          ...payment.meta,
          wata: { testMode: provider.testMode },
        },
      });
    } else if (provider.providerId === 'cryptobot') {
      const { apiToken } = provider.credentials;
      if (!apiToken) {
        throw new PaymentError(
          'CryptoBot credentials not configured. Set apiToken in payment provider settings.',
          'CRYPTOBOT_NOT_CONFIGURED',
        );
      }

      const gateway = new CryptoBotGateway(apiToken, provider.testMode);
      const returnUrl = config.payment.returnUrl;

      const invoice = await gateway.createInvoice({
        currencyType: 'fiat',
        fiat: payment.currency as CryptoBotFiat,
        amount: Number(payment.totalAmount),
        description: `${productName} - FreshDonate`,
        payload: payment.id,
        paidBtnName: 'callback',
        paidBtnUrl: `${returnUrl}?paymentId=${payment.id}`,
        expiresIn: 3600,
      });

      const payUrl = CryptoBotGateway.pickPayUrl(invoice);
      if (!payUrl) {
        throw new PaymentError(
          'CryptoBot did not return a pay URL',
          'CRYPTOBOT_CREATE_ERROR',
        );
      }

      await payment.update({
        providerId: provider.providerId,
        externalPaymentId: String(invoice.invoice_id),
        externalPaymentUrl: payUrl,
        meta: {
          ...payment.meta,
          cryptobot: { testMode: provider.testMode, hash: invoice.hash },
        },
      });
    } else if (provider.providerId === 'robokassa') {
      const { merchantLogin, password1, password2 } = provider.credentials;
      if (!merchantLogin || !password1 || !password2) {
        throw new PaymentError(
          'Robokassa credentials not configured. Set merchantLogin, password1 and password2 in payment provider settings.',
          'ROBOKASSA_NOT_CONFIGURED',
        );
      }

      const hashAlgorithm = ((provider.providerConfig?.hashAlgorithm as RobokassaHashAlgorithm) || 'sha256');
      const gateway = new RobokassaGateway(
        merchantLogin,
        password1,
        password2,
        provider.testMode,
        hashAlgorithm,
      );

      const invId = RobokassaGateway.makeInvId(payment.id);
      const link = gateway.createPaymentLink({
        amount: Number(payment.totalAmount),
        invId,
        description: `${productName} - FreshDonate`,
        email: payment.customerEmail || undefined,
        userParams: { paymentId: payment.id },
      });

      await payment.update({
        providerId: provider.providerId,
        externalPaymentId: String(link.invId),
        externalPaymentUrl: link.url,
        meta: {
          ...payment.meta,
          robokassa: {
            invId: link.invId,
            testMode: provider.testMode,
            hashAlgorithm,
          },
        },
      });
    } else if (provider.providerId === 'tebex') {
      const { webstoreToken, privateKey } = provider.credentials;
      if (!webstoreToken || !privateKey) {
        throw new PaymentError(
          'Tebex credentials not configured. Set webstoreToken and privateKey in payment provider settings.',
          'TEBEX_NOT_CONFIGURED',
        );
      }

      const coinPackages = (provider.providerConfig?.coinPackages || {}) as Record<string, string>;

      const gateway = new TebexGateway(webstoreToken, privateKey);
      const returnUrl = config.payment.returnUrl;

      const checkout = await gateway.createCheckout({
        amount: Number(payment.totalAmount),
        paymentId: payment.id,
        completeUrl: `${returnUrl}?paymentId=${payment.id}`,
        cancelUrl: `${returnUrl}?paymentId=${payment.id}&cancelled=1`,
        coinPackages: coinPackages as any,
        username: payment.customerNickname,
        ipAddress: customerIp || '',
      });

      await payment.update({
        providerId: provider.providerId,
        externalPaymentId: checkout.ident,
        externalPaymentUrl: checkout.checkoutUrl,
      });
    }
  }

  async handleYooKassaWebhook(event: string, object: any): Promise<void> {
    const externalId = object?.id;
    if (!externalId) return;

    const payment = await Payment.findOne({
      where: { externalPaymentId: externalId },
    });
    if (!payment) {
      console.warn(`YooKassa webhook: payment not found for external ID ${externalId}`);
      return;
    }

    if (event === 'payment.succeeded' && (payment.status === 'pending' || payment.status === 'expired')) {
      const paidAmount = object.amount ? Number(object.amount.value) : Number(payment.totalAmount);
      const incomeAmount = object.income_amount ? Number(object.income_amount.value) : undefined;

      const updateData: Record<string, any> = {
        status: 'paid',
        paidAt: new Date(object.captured_at || new Date()),
        totalAmount: paidAmount,
        currency: object.amount?.currency || payment.currency,
      };

      if (incomeAmount !== undefined) {
        const realCommission = Math.round((paidAmount - incomeAmount) * 100) / 100;
        const realPercent = paidAmount > 0
          ? Math.round((realCommission / paidAmount) * 10000) / 100
          : 0;
        updateData.providerAmount = incomeAmount;
        updateData.commissionAmount = realCommission;
        updateData.commissionPercent = realPercent;
      }

      await payment.update(updateData);
      await this.onPaymentPaid(payment.id);
      paymentCache.delete(getCacheKey(payment.customerNickname, payment.productId));

      console.log(`YooKassa: payment ${payment.id} succeeded (external: ${externalId})`);
    } else if (event === 'payment.canceled' && payment.status === 'pending') {
      await payment.update({
        status: 'failed',
        meta: {
          ...payment.meta,
          cancelReason: object.cancellation_details?.reason || 'unknown',
          cancelParty: object.cancellation_details?.party || 'unknown',
        },
      });

      paymentCache.delete(getCacheKey(payment.customerNickname, payment.productId));

      console.log(`YooKassa: payment ${payment.id} canceled (external: ${externalId})`);
    } else if (event === 'payment.waiting_for_capture' && payment.status === 'pending') {
      // Auto-capture: confirm immediately so the buyer's card is actually charged.
      const provider = await PaymentProvider.findOne({ where: { providerId: 'yookassa' } });
      if (provider) {
        const { shopId, secretKey } = provider.credentials;
        if (shopId && secretKey) {
          const gateway = new YooKassaGateway(shopId, secretKey);
          await gateway.capturePayment(externalId, Number(payment.totalAmount), payment.currency);
        }
      }
    }
  }

  async handleHeleketWebhook(payload: Record<string, any>): Promise<void> {
    // Heleket uses order_id = our payment.id; fall back to externalPaymentId.
    const paymentId = payload.order_id || payload.uuid;
    if (!paymentId) return;

    let payment = await Payment.findByPk(paymentId);
    if (!payment) {
      payment = await Payment.findOne({
        where: { externalPaymentId: payload.uuid },
      });
    }
    if (!payment) {
      console.warn(`Heleket webhook: payment not found for order_id=${payload.order_id} uuid=${payload.uuid}`);
      return;
    }

    const status = payload.status;
    const isFinal = payload.is_final;

    if ((status === 'paid' || status === 'paid_over') && (payment.status === 'pending' || payment.status === 'expired')) {
      const paidAmount = payload.payment_amount ? Number(payload.payment_amount) : Number(payment.totalAmount);
      const merchantAmount = payload.merchant_amount ? Number(payload.merchant_amount) : undefined;
      const commission = payload.commission ? Number(payload.commission) : undefined;

      const updateData: Record<string, any> = {
        status: 'paid',
        paidAt: new Date(),
        currency: payload.payer_currency || payment.currency,
      };

      if (merchantAmount !== undefined && commission !== undefined) {
        updateData.providerAmount = merchantAmount;
        updateData.commissionAmount = commission;
        updateData.commissionPercent = paidAmount > 0
          ? Math.round((commission / paidAmount) * 10000) / 100
          : 0;
      }

      updateData.meta = {
        ...payment.meta,
        heleket: {
          txid: payload.txid,
          network: payload.network,
          payerCurrency: payload.payer_currency,
          from: payload.from,
          paymentAmountUsd: payload.payment_amount_usd,
        },
      };

      await payment.update(updateData);
      await this.onPaymentPaid(payment.id);
      paymentCache.delete(getCacheKey(payment.customerNickname, payment.productId));

      console.log(`Heleket: payment ${payment.id} succeeded (uuid: ${payload.uuid}, txid: ${payload.txid})`);

    } else if (['cancel', 'fail', 'system_fail'].includes(status) && isFinal && payment.status === 'pending') {
      await payment.update({
        status: 'failed',
        meta: {
          ...payment.meta,
          cancelReason: status,
          heleket: {
            uuid: payload.uuid,
            network: payload.network,
          },
        },
      });

      paymentCache.delete(getCacheKey(payment.customerNickname, payment.productId));

      console.log(`Heleket: payment ${payment.id} failed with status ${status} (uuid: ${payload.uuid})`);
    }
  }

  async handleCryptoBotWebhook(update: CryptoBotWebhookUpdate): Promise<void> {
    if (update.update_type !== 'invoice_paid') return;

    const invoice = update.payload;
    if (!invoice) return;

    let payment: Payment | null = null;
    if (invoice.payload) {
      payment = await Payment.findByPk(invoice.payload);
    }
    if (!payment) {
      payment = await Payment.findOne({
        where: { externalPaymentId: String(invoice.invoice_id) },
      });
    }
    if (!payment) {
      console.warn(
        `CryptoBot webhook: payment not found (invoice_id=${invoice.invoice_id} payload=${invoice.payload})`,
      );
      return;
    }

    if (invoice.status !== 'paid') return;
    if (payment.status !== 'pending' && payment.status !== 'expired') return;

    // CryptoBot quotes fees in the paid asset. We keep our pre-charge fiat
    // total and percent and only stash the fee+asset+paid amount for analytics.
    const updateData: Record<string, any> = {
      status: 'paid',
      paidAt: invoice.paid_at ? new Date(invoice.paid_at) : new Date(),
      externalPaymentId: String(invoice.invoice_id),
      meta: {
        ...payment.meta,
        cryptobot: {
          ...(payment.meta.cryptobot || {}),
          invoiceId: invoice.invoice_id,
          hash: invoice.hash,
          paidAsset: invoice.paid_asset,
          paidAmount: invoice.paid_amount,
          paidFiatRate: invoice.paid_fiat_rate,
          feeAsset: invoice.fee_asset,
          feeAmount: invoice.fee_amount,
          paidAnonymously: invoice.paid_anonymously,
          comment: invoice.comment,
        },
      },
    };

    await payment.update(updateData);
    await this.onPaymentPaid(payment.id);
    paymentCache.delete(getCacheKey(payment.customerNickname, payment.productId));

    console.log(
      `CryptoBot: payment ${payment.id} succeeded (invoice: ${invoice.invoice_id}, asset: ${invoice.paid_asset})`,
    );
  }

  async handleWataWebhook(payload: WataWebhookPayload): Promise<void> {
    // Wata pre-payment notifications may arrive without a transactionStatus -
    // safe to ignore until the post-payment one lands.
    const status = payload.transactionStatus || payload.status;
    if (!status) {
      return;
    }

    let payment: Payment | null = null;

    if (payload.orderId) {
      payment = await Payment.findByPk(payload.orderId);
    }

    if (!payment) {
      const externalIds = [payload.transactionId, payload.paymentLinkId].filter(Boolean) as string[];
      if (externalIds.length > 0) {
        payment = await Payment.findOne({
          where: { externalPaymentId: { [Op.in]: externalIds } },
        });
      }
    }

    if (!payment) {
      console.warn(
        `Wata webhook: payment not found (orderId=${payload.orderId} tx=${payload.transactionId} link=${payload.paymentLinkId})`,
      );
      return;
    }

    if (status === 'Paid' && (payment.status === 'pending' || payment.status === 'expired')) {
      const paidAmount = payload.amount !== undefined ? Number(payload.amount) : Number(payment.totalAmount);

      // Wata webhooks don't carry commission - keep our pre-charge estimate.
      await payment.update({
        status: 'paid',
        paidAt: payload.paymentTime ? new Date(payload.paymentTime) : new Date(),
        totalAmount: paidAmount,
        currency: payload.currency || payment.currency,
        externalPaymentId: payload.transactionId || payment.externalPaymentId,
        meta: {
          ...payment.meta,
          wata: {
            ...(payment.meta.wata || {}),
            transactionId: payload.transactionId,
            paymentLinkId: payload.paymentLinkId,
          },
        },
      });

      await this.onPaymentPaid(payment.id);
      paymentCache.delete(getCacheKey(payment.customerNickname, payment.productId));

      console.log(`Wata: payment ${payment.id} succeeded (tx: ${payload.transactionId})`);
    } else if (status === 'Declined' && payment.status === 'pending') {
      await payment.update({
        status: 'failed',
        meta: {
          ...payment.meta,
          cancelReason: payload.errorCode || 'declined',
          wata: {
            ...(payment.meta.wata || {}),
            transactionId: payload.transactionId,
            errorCode: payload.errorCode,
            errorDescription: payload.errorDescription,
          },
        },
      });

      paymentCache.delete(getCacheKey(payment.customerNickname, payment.productId));

      console.log(`Wata: payment ${payment.id} declined (${payload.errorCode || 'unknown'})`);
    }
  }

  // Robokassa ResultURL: form-urlencoded body. We resolve the payment by
  // Shp_paymentId (our UUID) first, then fall back to InvId stored in
  // externalPaymentId. Returns true on success - caller responds with
  // `OK<InvId>` so Robokassa stops retrying.
  async handleRobokassaWebhook(payload: RobokassaWebhookPayload): Promise<boolean> {
    if (!payload.OutSum || !payload.InvId) return false;

    let payment: Payment | null = null;

    const shpPaymentId = payload.Shp_paymentId;
    if (typeof shpPaymentId === 'string' && shpPaymentId) {
      payment = await Payment.findByPk(shpPaymentId);
    }

    if (!payment) {
      payment = await Payment.findOne({
        where: {
          providerId: 'robokassa',
          externalPaymentId: payload.InvId,
        },
      });
    }

    if (!payment) {
      console.warn(
        `Robokassa webhook: payment not found (InvId=${payload.InvId} shpPaymentId=${shpPaymentId})`,
      );
      return false;
    }

    if (payment.status !== 'pending' && payment.status !== 'expired') {
      return true;
    }

    const paidAmount = Number(payload.OutSum);
    const fee = payload.Fee !== undefined ? Number(payload.Fee) : undefined;

    const updateData: Record<string, any> = {
      status: 'paid',
      paidAt: new Date(),
      totalAmount: Number.isFinite(paidAmount) ? paidAmount : Number(payment.totalAmount),
    };

    if (fee !== undefined && Number.isFinite(fee)) {
      updateData.commissionAmount = fee;
      updateData.providerAmount = Math.round((paidAmount - fee) * 100) / 100;
      updateData.commissionPercent = paidAmount > 0
        ? Math.round((fee / paidAmount) * 10000) / 100
        : 0;
    }

    updateData.meta = {
      ...payment.meta,
      robokassa: {
        ...(payment.meta.robokassa || {}),
        invId: payload.InvId,
        paymentMethod: payload.PaymentMethod,
        incCurrLabel: payload.IncCurrLabel,
        email: payload.EMail,
      },
    };

    await payment.update(updateData);
    await this.onPaymentPaid(payment.id);
    paymentCache.delete(getCacheKey(payment.customerNickname, payment.productId));

    console.log(`Robokassa: payment ${payment.id} succeeded (InvId: ${payload.InvId})`);
    return true;
  }

  // Tebex webhooks are wrapped as { id, type, date, subject }. We key off
  // the `type` (payment.completed / declined / refunded) and look up the
  // Payment by the `payment_id` we stashed in basket.custom at checkout
  // creation. Falls back to matching by external transaction_id.
  async handleTebexWebhook(envelope: TebexWebhookEnvelope): Promise<void> {
    const { type, subject } = envelope;

    // Tebex sends `validation.webhook` once when a new endpoint is added in
    // their panel - no subject, nothing to process, just ack it.
    if (type === 'validation.webhook' || !subject) {
      return;
    }

    const customPaymentId = (subject.custom as Record<string, any> | undefined)?.payment_id
      || subject.products?.[0]?.custom?.payment_id as string | undefined;

    let payment: Payment | null = null;
    if (customPaymentId) {
      payment = await Payment.findByPk(String(customPaymentId));
    }
    if (!payment && subject.transaction_id) {
      payment = await Payment.findOne({
        where: { externalPaymentId: subject.transaction_id },
      });
    }
    if (!payment) {
      console.warn(
        `Tebex webhook: payment not found (type=${type} tx=${subject.transaction_id} custom=${customPaymentId})`,
      );
      return;
    }

    if (type === 'payment.completed' && (payment.status === 'pending' || payment.status === 'expired')) {
      const paidAmount = subject.price_paid?.amount ?? subject.price?.amount ?? Number(payment.totalAmount);
      const gatewayFee = subject.fees?.gateway?.amount;

      const updateData: Record<string, any> = {
        status: 'paid',
        paidAt: new Date(),
        totalAmount: paidAmount,
        currency: subject.price_paid?.currency || subject.price?.currency || payment.currency,
        externalPaymentId: subject.transaction_id || payment.externalPaymentId,
      };

      if (gatewayFee !== undefined) {
        updateData.commissionAmount = gatewayFee;
        updateData.providerAmount = Math.round((paidAmount - gatewayFee) * 100) / 100;
        updateData.commissionPercent = paidAmount > 0
          ? Math.round((gatewayFee / paidAmount) * 10000) / 100
          : 0;
      }

      updateData.meta = {
        ...payment.meta,
        tebex: {
          transactionId: subject.transaction_id,
          paymentMethod: subject.payment_method?.name,
          customerEmail: subject.customer?.email,
        },
      };

      await payment.update(updateData);
      await this.onPaymentPaid(payment.id);
      paymentCache.delete(getCacheKey(payment.customerNickname, payment.productId));

      console.log(`Tebex: payment ${payment.id} completed (tx: ${subject.transaction_id})`);
    } else if (type === 'payment.declined' && payment.status === 'pending') {
      await payment.update({
        status: 'failed',
        meta: {
          ...payment.meta,
          cancelReason: subject.decline_reason?.code || 'declined',
          tebex: {
            transactionId: subject.transaction_id,
            declineMessage: subject.decline_reason?.message,
          },
        },
      });

      paymentCache.delete(getCacheKey(payment.customerNickname, payment.productId));

      console.log(`Tebex: payment ${payment.id} declined (${subject.decline_reason?.code || 'unknown'})`);
    } else if (type === 'payment.refunded' && (payment.status === 'paid' || payment.status === 'delivered')) {
      await payment.update({
        status: 'refunded',
        meta: {
          ...payment.meta,
          tebex: {
            ...((payment.meta as Record<string, any>).tebex || {}),
            refundedAt: new Date().toISOString(),
            transactionId: subject.transaction_id,
          },
        },
      });

      console.log(`Tebex: payment ${payment.id} refunded (tx: ${subject.transaction_id})`);
    }
  }

  async confirmPayment(paymentId: string): Promise<PaymentDto> {
    const payment = await Payment.findByPk(paymentId);
    if (!payment) throw new NotFoundError('Payment not found');
    // Allow rescuing an auto-expired payment too - useful when webhook
    // arrived late or buyer paid offline.
    if (payment.status !== 'pending' && payment.status !== 'expired') {
      throw new ValidationError('Payment is not pending');
    }

    await payment.update({
      status: 'paid',
      paidAt: new Date(),
    });

    await this.onPaymentPaid(payment.id);
    await payment.reload();

    paymentCache.delete(getCacheKey(payment.customerNickname, payment.productId));

    return toDto(payment);
  }

  async findAll(options?: {
    status?: PaymentStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: PaymentDto[]; total: number }> {
    const where: any = {};
    if (options?.status) {
      where.status = options.status;
    }
    if (options?.search) {
      where[Op.or] = [
        { productName: { [Op.iLike]: `%${options.search}%` } },
        { customerNickname: { [Op.iLike]: `%${options.search}%` } },
        { customerEmail: { [Op.iLike]: `%${options.search}%` } },
      ];
    }

    const { rows, count } = await Payment.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    });

    return { items: rows.map(toDto), total: count };
  }

  async findById(id: string): Promise<PaymentDto | null> {
    const payment = await Payment.findByPk(id);
    if (!payment) return null;

    // Lazy-expire on read so /payments/:id/status flips immediately without
    // waiting for the sweeper.
    if (this.expirationService.isStale(payment)) {
      await payment.update({ status: 'expired' });
    }

    return toDto(payment);
  }

  async findByNickname(nickname: string): Promise<PaymentDto[]> {
    const payments = await Payment.findAll({
      where: { customerNickname: nickname },
      order: [['created_at', 'DESC']],
    });
    return payments.map(toDto);
  }

  async getStats(): Promise<{
    revenueByCurrency: { currency: string; total: number; commission: number; provider: number }[];
    totalPayments: number;
    totalCustomers: number;
    recentPayments: PaymentDto[];
  }> {
    const paidWhere = { status: { [Op.in]: ['paid', 'delivered'] } };

    const [revenueRaw, totalPayments, totalCustomers, recentRows] = await Promise.all([
      Payment.findAll({
        attributes: [
          'currency',
          [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'total'],
          [fn('COALESCE', fn('SUM', col('commission_amount')), 0), 'commission'],
          [fn('COALESCE', fn('SUM', col('provider_amount')), 0), 'provider'],
        ],
        where: paidWhere,
        group: ['currency'],
        raw: true,
      }),
      Payment.count({ where: paidWhere }),
      this.customerService.getCount(),
      Payment.findAll({
        order: [['created_at', 'DESC']],
        limit: 10,
      }),
    ]);

    const revenueByCurrency = revenueRaw as unknown as {
      currency: string; total: string; commission: string; provider: string;
    }[];

    return {
      revenueByCurrency: revenueByCurrency.map((r) => ({
        currency: r.currency,
        total: Number(r.total) || 0,
        commission: Number(r.commission) || 0,
        provider: Number(r.provider) || 0,
      })),
      totalPayments,
      totalCustomers,
      recentPayments: recentRows.map(toDto),
    };
  }

  async getRevenueChart(options: {
    from: string;
    to: string;
    period: 'hourly' | 'daily' | 'weekly' | 'monthly';
    currency?: string;
  }): Promise<{ date: string; amount: number; count: number }[]> {
    const { from, to, period, currency } = options;

    const settings = await this.settingsService.get();
    const requested = currency?.toUpperCase();
    const target =
      requested && isSupportedCurrency(requested) ? requested : settings.base_currency;

    const truncFn = period === 'monthly'
      ? "date_trunc('month', paid_at)"
      : period === 'weekly'
        ? "date_trunc('week', paid_at)"
        : period === 'hourly'
          ? "date_trunc('hour', paid_at)"
          : "date_trunc('day', paid_at)";

    const amountInTarget = buildAmountInTargetSql(
      settings.currency_rates,
      settings.base_currency,
      target,
      'total_amount',
      'currency',
    );

    const results = await Payment.findAll({
      attributes: [
        [literal(truncFn), 'date'],
        [fn('COALESCE', fn('SUM', literal(amountInTarget)), 0), 'amount'],
        [fn('COUNT', col('id')), 'count'],
      ],
      where: {
        status: { [Op.in]: ['paid', 'delivered'] },
        paidAt: {
          [Op.gte]: new Date(from),
          [Op.lte]: new Date(to),
        },
      },
      group: [literal(truncFn)] as any,
      order: [[literal(truncFn), 'ASC']] as any,
      raw: true,
    }) as unknown as { date: string; amount: string; count: string }[];

    return results.map((r) => ({
      date: r.date,
      amount: Number(r.amount) || 0,
      count: Number(r.count) || 0,
    }));
  }

  async getSummary(options: {
    from: string;
    to: string;
    currency?: string;
    tz?: string;
  }): Promise<StatsSummary> {
    const { from, to, currency, tz } = options;

    const settings = await this.settingsService.get();
    const requested = currency?.toUpperCase();
    const target =
      requested && isSupportedCurrency(requested) ? requested : settings.base_currency;

    const safeTz = resolveTimeZone(tz);

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const lengthMs = Math.max(0, toDate.getTime() - fromDate.getTime());
    // Previous window ends just before current starts (1ms gap to avoid
    // double-counting an edge payment) and has the same length.
    const prevTo = new Date(fromDate.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - lengthMs);

    const amountInTarget = buildAmountInTargetSql(
      settings.currency_rates,
      settings.base_currency,
      target,
      'total_amount',
      'currency',
    );
    const commissionInTarget = buildAmountInTargetSql(
      settings.currency_rates,
      settings.base_currency,
      target,
      'commission_amount',
      'currency',
    );

    // Format the day directly to a string in PostgreSQL so the result is not
    // re-interpreted as Node-local `timestamp without time zone` by the pg
    // driver (which would shift the bucket when Node's TZ differs).
    const dailyTrunc = `to_char(date_trunc('day', paid_at AT TIME ZONE '${safeTz}'), 'YYYY-MM-DD')`;
    const paidStatuses = { [Op.in]: ['paid', 'delivered'] as PaymentStatus[] };
    const currentWhere = {
      status: paidStatuses,
      paidAt: { [Op.gte]: fromDate, [Op.lte]: toDate },
    };
    const prevWhere = {
      status: paidStatuses,
      paidAt: { [Op.gte]: prevFrom, [Op.lte]: prevTo },
    };

    type DailyRow = { date: string; amount: string; commission: string; count: string; customers: string };
    type AggRow = { amount: string; commission: string; count: string; customers: string } | null;
    type ProviderRow = { providerId: string | null; amount: string; count: string };
    type ProductRow = { productId: string; productName: string; amount: string; count: string };

    const [dailyRows, currentAgg, prevAgg, providerRows, productRows] = (await Promise.all([
      Payment.findAll({
        attributes: [
          [literal(dailyTrunc), 'date'],
          [fn('COALESCE', fn('SUM', literal(amountInTarget)), 0), 'amount'],
          [fn('COALESCE', fn('SUM', literal(commissionInTarget)), 0), 'commission'],
          [fn('COUNT', col('id')), 'count'],
          [literal('COUNT(DISTINCT customer_nickname)'), 'customers'],
        ],
        where: currentWhere,
        group: [literal(dailyTrunc)] as any,
        order: [[literal(dailyTrunc), 'ASC']] as any,
        raw: true,
      }),
      Payment.findOne({
        attributes: [
          [fn('COALESCE', fn('SUM', literal(amountInTarget)), 0), 'amount'],
          [fn('COALESCE', fn('SUM', literal(commissionInTarget)), 0), 'commission'],
          [fn('COUNT', col('id')), 'count'],
          [literal('COUNT(DISTINCT customer_nickname)'), 'customers'],
        ],
        where: currentWhere,
        raw: true,
      }),
      Payment.findOne({
        attributes: [
          [fn('COALESCE', fn('SUM', literal(amountInTarget)), 0), 'amount'],
          [fn('COALESCE', fn('SUM', literal(commissionInTarget)), 0), 'commission'],
          [fn('COUNT', col('id')), 'count'],
          [literal('COUNT(DISTINCT customer_nickname)'), 'customers'],
        ],
        where: prevWhere,
        raw: true,
      }),
      Payment.findAll({
        attributes: [
          'providerId',
          [fn('COALESCE', fn('SUM', literal(amountInTarget)), 0), 'amount'],
          [fn('COUNT', col('id')), 'count'],
        ],
        where: currentWhere,
        group: ['providerId'],
        raw: true,
      }),
      Payment.findAll({
        attributes: [
          'productId',
          'productName',
          [fn('COALESCE', fn('SUM', literal(amountInTarget)), 0), 'amount'],
          [fn('COUNT', col('id')), 'count'],
        ],
        where: currentWhere,
        group: ['productId', 'productName'],
        order: [[fn('SUM', literal(amountInTarget)), 'DESC']] as any,
        limit: 10,
        raw: true,
      }),
    ])) as unknown as [DailyRow[], AggRow, AggRow, ProviderRow[], ProductRow[]];

    const amountByDay = new Map<string, number>();
    const commissionByDay = new Map<string, number>();
    const countByDay = new Map<string, number>();
    const customersByDay = new Map<string, number>();
    for (const row of dailyRows) {
      const dayKey = truncatedRowToDayKey(row.date);
      amountByDay.set(dayKey, Number(row.amount) || 0);
      commissionByDay.set(dayKey, Number(row.commission) || 0);
      countByDay.set(dayKey, Number(row.count) || 0);
      customersByDay.set(dayKey, Number(row.customers) || 0);
    }

    const days = eachDayInTz(fromDate, toDate, safeTz);
    const round2 = (n: number): number => Math.round(n * 100) / 100;

    const revenueSparkline = days.map((d) => round2(amountByDay.get(d) || 0));
    const commissionSparkline = days.map((d) => round2(commissionByDay.get(d) || 0));
    const countSparkline = days.map((d) => countByDay.get(d) || 0);
    const customersSparkline = days.map((d) => customersByDay.get(d) || 0);
    const avgSparkline = days.map((d) => {
      const amt = amountByDay.get(d) || 0;
      const cnt = countByDay.get(d) || 0;
      return cnt > 0 ? round2(amt / cnt) : 0;
    });

    const curRevenue = Number(currentAgg?.amount) || 0;
    const curCommission = Number(currentAgg?.commission) || 0;
    const curCount = Number(currentAgg?.count) || 0;
    const curCustomers = Number(currentAgg?.customers) || 0;
    const curAvg = curCount > 0 ? curRevenue / curCount : 0;

    const prevRevenue = Number(prevAgg?.amount) || 0;
    const prevCommission = Number(prevAgg?.commission) || 0;
    const prevCount = Number(prevAgg?.count) || 0;
    const prevCustomers = Number(prevAgg?.customers) || 0;
    const prevAvg = prevCount > 0 ? prevRevenue / prevCount : 0;

    return {
      currency: target,
      revenue: {
        current: round2(curRevenue),
        previous: round2(prevRevenue),
        sparkline: revenueSparkline,
      },
      commission: {
        current: round2(curCommission),
        previous: round2(prevCommission),
        sparkline: commissionSparkline,
      },
      customers: {
        current: curCustomers,
        previous: prevCustomers,
        sparkline: customersSparkline,
      },
      avgOrder: {
        current: round2(curAvg),
        previous: round2(prevAvg),
        sparkline: avgSparkline,
      },
      payments: {
        current: curCount,
        previous: prevCount,
        sparkline: countSparkline,
      },
      paymentProviders: providerRows.map((p) => ({
        providerId: p.providerId,
        count: Number(p.count) || 0,
        amount: round2(Number(p.amount) || 0),
      })),
      topProducts: productRows.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        count: Number(p.count) || 0,
        amount: round2(Number(p.amount) || 0),
      })),
    };
  }
}

function resolveTimeZone(tz?: string): string {
  if (!tz) return 'UTC';
  try {
    // Throws RangeError for invalid IANA names — safe against SQL injection
    // because we only embed strings that pass this validation.
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function formatDayInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

function eachDayInTz(from: Date, to: Date, tz: string): string[] {
  const startStr = formatDayInTz(from, tz);
  const endStr = formatDayInTz(to, tz);
  const days: string[] = [];
  const cur = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

function truncatedRowToDayKey(value: string | Date): string {
  return String(value).slice(0, 10);
}
