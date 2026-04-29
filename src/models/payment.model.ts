import {
  Table,
  Column,
  DataType,
  Default,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';
import { Customer } from './customer.model';

export type PaymentStatus = 'pending' | 'paid' | 'delivered' | 'failed' | 'refunded' | 'expired';

interface PaymentAttributes {
  id: string;
  customerId: string;
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
  paidAt: Date | null;
  deliveredAt: Date | null;
  meta: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  userSelectedCount: number;
}

type PaymentCreationAttributes = Optional<
  PaymentAttributes,
  | 'id'
  | 'status'
  | 'productCurrency'
  | 'commissionPercent'
  | 'commissionAmount'
  | 'providerAmount'
  | 'paymentOptionId'
  | 'providerId'
  | 'externalPaymentId'
  | 'externalPaymentUrl'
  | 'paidAt'
  | 'deliveredAt'
  | 'meta'
  | 'userSelectedCount'
  | 'createdAt'
  | 'updatedAt'
>;

@Table({ tableName: 'payments' })
export class Payment extends BaseModel<PaymentAttributes, PaymentCreationAttributes> {
  @ForeignKey(() => Customer)
  @Column(DataType.UUID)
  declare customerId: string;

  @BelongsTo(() => Customer)
  declare customer: Customer;

  @Column(DataType.UUID)
  declare productId: string;

  @Column(DataType.STRING(128))
  declare productName: string;

  @Column(DataType.DECIMAL(12, 2))
  declare productPrice: number;

  @Default('')
  @Column(DataType.STRING(8))
  declare productCurrency: string;

  @Column(DataType.STRING(8))
  declare currency: string;

  @Column(DataType.INTEGER)
  declare quantity: number;

  @Column(DataType.DECIMAL(12, 2))
  declare totalAmount: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  declare commissionPercent: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  declare commissionAmount: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  declare providerAmount: number;

  @Default('pending')
  @Column(DataType.STRING(16))
  declare status: PaymentStatus;

  @Column(DataType.UUID)
  declare paymentOptionId: string | null;

  @Column(DataType.STRING(32))
  declare providerId: string | null;

  @Column(DataType.STRING(512))
  declare externalPaymentId: string | null;

  @Column(DataType.STRING(1024))
  declare externalPaymentUrl: string | null;

  @Column(DataType.DATE)
  declare paidAt: Date | null;

  @Column(DataType.DATE)
  declare deliveredAt: Date | null;

  @Default({})
  @Column(DataType.JSONB)
  declare meta: Record<string, any>;

  @Default(1)
  @Column(DataType.INTEGER)
  declare userSelectedCount: number; // if product type is item, else - 1
}
