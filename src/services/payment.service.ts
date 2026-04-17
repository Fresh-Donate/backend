import { Payment, type PaymentStatus } from '@/models/payment.model';
import { Customer } from '@/models/customer.model';
import { Product } from '@/models/product.model';
import { PaymentOption } from '@/models/payment-option.model';
import { PaymentProvider } from '@/models/payment-provider.model';
import { CustomerService } from './customer.service';
import { SettingsService } from './settings.service';
import { DeliveryService } from './delivery.service';
import { NotFoundError, ValidationError, PaymentError } from '@/core';
import { Op, fn, col, literal } from 'sequelize';
import { YooKassaGateway } from '@/gateways/yookassa.gateway';
import { HeleketGateway } from '@/gateways/heleket.gateway';
import { config } from '@/config';

export interface PaymentDto {
  id: string;
  customerId: string;
  customerNickname?: string;
  customerEmail?: string;
  productId: string;
  productName: string;
  productPrice: number;
  productCurrency: string;
  currency: string;
  quantity: number;
  totalAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  providerAmount: number;
  status: PaymentStatus;
  paymentOptionId: string | null;
  providerId: string | null;
  externalPaymentId: string | null;
  externalPaymentUrl: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  meta: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentDto {
  productId: string;
  nickname: string;
  email: string;
  paymentOptionId: string;
}

function toDto(p: Payment): PaymentDto {
  return {
    id: p.id,
    customerId: p.customerId,
    customerNickname: p.customer?.nickname,
    customerEmail: p.customer?.email,
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
  };
}

// Simple in-memory cache for pending payments (productId+customerId → paymentId)
const paymentCache = new Map<string, { paymentId: string; expiresAt: number }>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function getCacheKey(customerId: string, productId: string): string {
  return `${customerId}:${productId}`;
}

export class PaymentService {
  private customerService = new CustomerService();
  private settingsService = new SettingsService();
  private deliveryService = new DeliveryService();

  async create(data: CreatePaymentDto): Promise<PaymentDto> {
    // 1. Validate product
    const product = await Product.findByPk(data.productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // 2. Find or create customer
    const customer = await this.customerService.findOrCreate(data.nickname, data.email);

    // 3. Check cache — if a pending payment already exists, return it
    const cacheKey = getCacheKey(customer.id, data.productId);
    const cached = paymentCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const existing = await Payment.findByPk(cached.paymentId, {
        include: [{ model: Customer, required: false }],
      });
      if (existing && existing.status === 'pending') {
        return toDto(existing);
      }
      paymentCache.delete(cacheKey);
    }

    // 4. Validate payment option and provider
    const option = await PaymentOption.findByPk(data.paymentOptionId);
    if (!option) {
      throw new ValidationError('Payment option not found');
    }

    const provider = await PaymentProvider.findOne({ where: { providerId: option.providerId } });

    // Check provider is usable (skip check if demo mode)
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

    // 5. Determine payment currency and commission from provider settings
    const productPrice = Number(product.price);
    const productCurrency = product.currency;
    let paymentCurrency = productCurrency;
    let commissionPercent = 0;
    let commissionAmount = 0;
    let totalAmount = productPrice;
    let providerAmount = productPrice;

    if (provider) {
      // Determine actual payment currency from provider
      if (provider.supportedCurrencies.length > 0) {
        paymentCurrency = provider.supportedCurrencies.includes(productCurrency)
          ? productCurrency
          : provider.supportedCurrencies[0];
      }

      // Find method commission from provider's methods array
      const method = provider.methods.find((m) => m.id === option.methodId);
      commissionPercent = method?.commission ?? 0;
      commissionAmount = Math.round(productPrice * commissionPercent) / 100;

      const rule = provider.commissionRule;
      if (rule.mode === 'buyer') {
        totalAmount = productPrice + commissionAmount;
        providerAmount = productPrice;
      } else if (rule.mode === 'split') {
        const buyerShare = Math.round(commissionAmount * 50) / 100;
        totalAmount = productPrice + buyerShare;
        providerAmount = productPrice - (commissionAmount - buyerShare);
      } else {
        totalAmount = productPrice;
        providerAmount = productPrice - commissionAmount;
      }
    }

    // 5. Create payment record
    const payment = await Payment.create({
      customerId: customer.id,
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
    });

    // 7. Check if demo mode
    if (settings.demo_payments) {
      // Demo: instantly mark as paid
      await payment.update({
        status: 'paid',
        paidAt: new Date(),
        meta: { demo: true },
      });

      // Update customer stats
      await this.customerService.incrementStats(customer.id, totalAmount);

      // Attempt delivery (RCON with retries)
      await this.deliveryService.attemptDelivery(payment.id);

      const result = await Payment.findByPk(payment.id, {
        include: [{ model: Customer, required: false }],
      });
      if (!result) throw new Error('Payment vanished after creation');
      return toDto(result);
    }

    // 8. Non-demo: cache the pending payment for 2 minutes
    paymentCache.set(cacheKey, {
      paymentId: payment.id,
      expiresAt: Date.now() + CACHE_TTL,
    });

    // 9. Create external payment via provider gateway
    if (provider && provider.enabled) {
      await this.createExternalPayment(payment, provider, option.methodId, product.name);
    }

    const result = await Payment.findByPk(payment.id, {
      include: [{ model: Customer, required: false }],
    });
    if (!result) throw new Error('Payment vanished after creation');
    return toDto(result);
  }

  /**
   * Map YooKassa method IDs to API payment_method_data types
   */
  private static readonly YOOKASSA_METHOD_MAP: Record<string, string> = {
    bank_card: 'bank_card',
    sbp: 'sbp',
    yoo_money: 'yoo_money',
    sber_pay: 'sberbank',
    t_pay: 'tinkoff_bank',
    qiwi: 'qiwi',
  };

  /**
   * Create external payment via provider gateway (YooKassa, etc.)
   */
  private async createExternalPayment(
    payment: Payment,
    provider: InstanceType<typeof PaymentProvider>,
    methodId: string,
    productName: string,
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
        description: `${productName} — FreshDonate`,
        returnUrl: `${returnUrl}?paymentId=${payment.id}`,
        paymentMethodType: PaymentService.YOOKASSA_METHOD_MAP[methodId],
        metadata: {
          payment_id: payment.id,
          customer_id: payment.customerId,
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
    }
  }

  /**
   * Handle YooKassa webhook notification
   */
  async handleYooKassaWebhook(event: string, object: any): Promise<void> {
    const externalId = object?.id;
    if (!externalId) return;

    const payment = await Payment.findOne({
      where: { externalPaymentId: externalId },
      include: [{ model: Customer, required: false }],
    });
    if (!payment) {
      console.warn(`YooKassa webhook: payment not found for external ID ${externalId}`);
      return;
    }

    if (event === 'payment.succeeded' && payment.status === 'pending') {
      // Payment succeeded — update with REAL amounts from YooKassa
      const paidAmount = object.amount ? Number(object.amount.value) : Number(payment.totalAmount);
      const incomeAmount = object.income_amount ? Number(object.income_amount.value) : undefined;

      // Calculate real commission from actual YooKassa data
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

      // Update customer stats
      await this.customerService.incrementStats(payment.customerId, Number(payment.totalAmount));

      // Attempt delivery
      await this.deliveryService.attemptDelivery(payment.id);

      // Clear cache
      const cacheKey = getCacheKey(payment.customerId, payment.productId);
      paymentCache.delete(cacheKey);

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

      // Clear cache
      const cacheKey = getCacheKey(payment.customerId, payment.productId);
      paymentCache.delete(cacheKey);

      console.log(`YooKassa: payment ${payment.id} canceled (external: ${externalId})`);
    } else if (event === 'payment.waiting_for_capture' && payment.status === 'pending') {
      // Auto-capture: confirm the payment immediately
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

  /**
   * Handle Heleket webhook notification
   * Success statuses: 'paid', 'paid_over'
   * Fail statuses: 'cancel', 'fail', 'system_fail'
   */
  async handleHeleketWebhook(payload: Record<string, any>): Promise<void> {
    // Heleket uses order_id = our payment.id
    const paymentId = payload.order_id || payload.uuid;
    if (!paymentId) return;

    // Try by order_id first (our payment ID), fallback to externalPaymentId
    let payment = await Payment.findByPk(paymentId, {
      include: [{ model: Customer, required: false }],
    });
    if (!payment) {
      payment = await Payment.findOne({
        where: { externalPaymentId: payload.uuid },
        include: [{ model: Customer, required: false }],
      });
    }
    if (!payment) {
      console.warn(`Heleket webhook: payment not found for order_id=${payload.order_id} uuid=${payload.uuid}`);
      return;
    }

    const status = payload.status;
    const isFinal = payload.is_final;

    if ((status === 'paid' || status === 'paid_over') && payment.status === 'pending') {
      // Payment succeeded — update with real amounts from Heleket
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

      // Store crypto-specific data in meta
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

      // Update customer stats
      await this.customerService.incrementStats(payment.customerId, Number(payment.totalAmount));

      // Attempt delivery
      await this.deliveryService.attemptDelivery(payment.id);

      // Clear cache
      const cacheKey = getCacheKey(payment.customerId, payment.productId);
      paymentCache.delete(cacheKey);

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

      const cacheKey = getCacheKey(payment.customerId, payment.productId);
      paymentCache.delete(cacheKey);

      console.log(`Heleket: payment ${payment.id} failed with status ${status} (uuid: ${payload.uuid})`);
    }
  }

  /**
   * Called by webhook or admin to manually confirm a payment
   */
  async confirmPayment(paymentId: string): Promise<PaymentDto> {
    const payment = await Payment.findByPk(paymentId, {
      include: [{ model: Customer, required: false }],
    });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.status !== 'pending') throw new ValidationError('Payment is not pending');

    await payment.update({
      status: 'paid',
      paidAt: new Date(),
    });

    // Update customer stats
    await this.customerService.incrementStats(payment.customerId, Number(payment.totalAmount));

    // Attempt delivery (RCON with retries)
    await this.deliveryService.attemptDelivery(payment.id);

    // Reload to get updated status
    await payment.reload();

    // Clear cache
    const cacheKey = getCacheKey(payment.customerId, payment.productId);
    paymentCache.delete(cacheKey);

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
        { '$customer.nickname$': { [Op.iLike]: `%${options.search}%` } },
        { '$customer.email$': { [Op.iLike]: `%${options.search}%` } },
      ];
    }

    const { rows, count } = await Payment.findAndCountAll({
      where,
      include: [{ model: Customer, required: false }],
      order: [['created_at', 'DESC']],
      limit: options?.limit || 50,
      offset: options?.offset || 0,
      subQuery: false,
    });

    return { items: rows.map(toDto), total: count };
  }

  async findById(id: string): Promise<PaymentDto | null> {
    const payment = await Payment.findByPk(id, {
      include: [{ model: Customer, required: false }],
    });
    return payment ? toDto(payment) : null;
  }

  async findByCustomerId(customerId: string): Promise<PaymentDto[]> {
    const payments = await Payment.findAll({
      where: { customerId },
      include: [{ model: Customer, required: false }],
      order: [['created_at', 'DESC']],
    });
    return payments.map(toDto);
  }

  /** Stats for dashboard */
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
      Customer.count(),
      Payment.findAll({
        include: [{ model: Customer, required: false }],
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

  /** Revenue chart data grouped by period, optionally filtered by currency */
  async getRevenueChart(options: {
    from: string;
    to: string;
    period: 'daily' | 'weekly' | 'monthly';
    currency?: string;
  }): Promise<{ date: string; amount: number; count: number }[]> {
    const { from, to, period, currency } = options;

    const truncFn = period === 'monthly'
      ? "date_trunc('month', paid_at)"
      : period === 'weekly'
        ? "date_trunc('week', paid_at)"
        : "date_trunc('day', paid_at)";

    const where: any = {
      status: { [Op.in]: ['paid', 'delivered'] },
      paidAt: {
        [Op.gte]: new Date(from),
        [Op.lte]: new Date(to),
      },
    };
    if (currency) {
      where.currency = currency;
    }

    const results = await Payment.findAll({
      attributes: [
        [literal(truncFn), 'date'],
        [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'amount'],
        [fn('COUNT', col('id')), 'count'],
      ],
      where,
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
}
