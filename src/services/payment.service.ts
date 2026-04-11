import { Payment, PaymentStatus } from '@/models/payment.model';
import { Customer } from '@/models/customer.model';
import { Product } from '@/models/product.model';
import { PaymentOption } from '@/models/payment-option.model';
import { PaymentProvider } from '@/models/payment-provider.model';
import { CustomerService } from './customer.service';
import { SettingsService } from './settings.service';
import { DeliveryService } from './delivery.service';
import { NotFoundError, ValidationError } from '@/core';
import { Op, fn, col, literal } from 'sequelize';

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

    // 4. Determine payment currency and commission from provider settings
    const productPrice = Number(product.price);
    const productCurrency = product.currency;
    let paymentCurrency = productCurrency; // fallback to product currency
    let commissionPercent = 0;
    let commissionAmount = 0;
    let totalAmount = productPrice;
    let providerAmount = productPrice;

    const option = await PaymentOption.findByPk(data.paymentOptionId);
    if (option) {
      const provider = await PaymentProvider.findOne({ where: { providerId: option.providerId } });
      if (provider) {
        // Determine actual payment currency from provider
        // If provider supports product currency — use it; otherwise use first supported
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
          // Buyer pays commission on top
          totalAmount = productPrice + commissionAmount;
          providerAmount = productPrice;
        } else if (rule.mode === 'split') {
          // Split: buyer pays half, seller absorbs half
          const buyerShare = Math.round(commissionAmount * 50) / 100;
          totalAmount = productPrice + buyerShare;
          providerAmount = productPrice - (commissionAmount - buyerShare);
        } else {
          // Seller mode (default): commission deducted from seller's revenue
          totalAmount = productPrice;
          providerAmount = productPrice - commissionAmount;
        }
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

    // 6. Check if demo mode
    const settings = await this.settingsService.get();
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
      return toDto(result!);
    }

    // 7. Non-demo: cache the pending payment for 2 minutes
    paymentCache.set(cacheKey, {
      paymentId: payment.id,
      expiresAt: Date.now() + CACHE_TTL,
    });

    // TODO: Create external payment via provider SDK (YooKassa / Heleket)
    // const provider = await PaymentProvider.findOne({ where: { providerId: ... } });
    // const externalPayment = await providerSDK.createPayment({ amount: totalAmount, ... });
    // await payment.update({
    //   providerId: provider.providerId,
    //   externalPaymentId: externalPayment.id,
    //   externalPaymentUrl: externalPayment.confirmationUrl,
    // });

    const result = await Payment.findByPk(payment.id, {
      include: [{ model: Customer, required: false }],
    });
    return toDto(result!);
  }

  /**
   * Called by webhook when payment is confirmed by provider
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

    const [revenueByCurrency, totalPayments, totalCustomers, recentRows] = await Promise.all([
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
      }) as unknown as { currency: string; total: string; commission: string; provider: string }[],
      Payment.count({ where: paidWhere }),
      Customer.count(),
      Payment.findAll({
        include: [{ model: Customer, required: false }],
        order: [['created_at', 'DESC']],
        limit: 10,
      }),
    ]);

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
