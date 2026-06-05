import type { PaymentStatus } from '@/models/payment.model';

export interface PaymentItemDto {
  id: string;
  productId: string;
  productName: string;
  productPrice: number;
  productCurrency: string;
  quantity: number;
  userSelectedCount: number;
  lineTotal: number;
  discountPercent: number;
  upgradeDiscount: number;
}

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
  itemsCount: number;
  // Present on single-payment reads (findById); omitted from list responses.
  items?: PaymentItemDto[];
}

export interface CreatePaymentDto {
  productId: string;
  nickname: string;
  email: string;
  count?: number;
  paymentOptionId: string;
  customerIp?: string; // Required for tebex
}

export interface CartItemInput {
  productId: string;
  count?: number;
}

export interface CreateCartDto {
  items: CartItemInput[];
  nickname: string;
  email: string;
  paymentOptionId: string;
  customerIp?: string; // Required for tebex
}

export interface CartPreviewItem {
  productId: string;
  productName: string;
  count: number;
  unitPrice: number;
  unitOriginalPrice: number;
  lineTotal: number;
  discountPercent: number;
  upgradeDiscount: number;
  blocked: boolean;
  blockedReference?: { productName: string; referencePrice: number };
  // Set when this line shares an upgrade group with another line in the cart.
  groupConflict?: boolean;
}

export interface CartPreviewDto {
  currency: string;
  items: CartPreviewItem[];
  total: number;
  blockedCount: number;
  currencyMismatch: boolean;
}
