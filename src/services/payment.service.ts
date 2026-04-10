import { Payment, PaymentStatus } from '@/models/payment.model';
import { Customer } from '@/models/customer.model';
import { Product } from '@/models/product.model';
import { CustomerService } from './customer.service';
import { SettingsService } from './settings.service';
import { DeliveryService } from './delivery.service';
import { NotFoundError, ValidationError } from '@/core';
import { Op } from 'sequelize';

export interface PaymentDto {
  id: string;
  customerId: string;
  customerNickname?: string;
  customerEmail?: string;
  productId: string;
  productName: string;
  productPrice: number;
  currency: string;
  quantity: number;
  totalAmount: number;
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
    currency: p.currency,
    quantity: p.quantity,
    totalAmount: Number(p.totalAmount),
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

    // 4. Calculate total (for now 1:1, commission logic can be added later)
    const totalAmount = Number(product.price);

    // 5. Create payment record
    const payment = await Payment.create({
      customerId: customer.id,
      productId: product.id,
      productName: product.name,
      productPrice: Number(product.price),
      currency: product.currency,
      quantity: product.quantity,
      totalAmount,
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
    totalRevenue: number;
    totalPayments: number;
    totalCustomers: number;
    recentPayments: PaymentDto[];
  }> {
    const [revenueResult, totalPayments, totalCustomers, recentRows] = await Promise.all([
      Payment.sum('totalAmount', { where: { status: { [Op.in]: ['paid', 'delivered'] } } }),
      Payment.count({ where: { status: { [Op.in]: ['paid', 'delivered'] } } }),
      Customer.count(),
      Payment.findAll({
        include: [{ model: Customer, required: false }],
        order: [['created_at', 'DESC']],
        limit: 10,
      }),
    ]);

    return {
      totalRevenue: Number(revenueResult) || 0,
      totalPayments,
      totalCustomers,
      recentPayments: recentRows.map(toDto),
    };
  }
}
