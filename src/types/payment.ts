import type { PaymentStatus } from '@/models/payment.model';

export interface PaymentDto {
  id: string;
  customerNickname: string;
  customerEmail: string;
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
  userSelectedCount: number;
}

export interface CreatePaymentDto {
  productId: string;
  nickname: string;
  email: string;
  count?: number;
  paymentOptionId: string;
}
