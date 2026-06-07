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
import { Payment } from './payment.model';

interface PaymentItemAttributes {
  id: string;
  paymentId: string;
  productId: string;
  productName: string;
  productPrice: number;
  productCurrency: string;
  quantity: number;
  userSelectedCount: number;
  lineTotal: number;
  discountPercent: number;
  upgradeDiscount: number;
  meta: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

type PaymentItemCreationAttributes = Optional<
  PaymentItemAttributes,
  | 'id'
  | 'productName'
  | 'productPrice'
  | 'productCurrency'
  | 'quantity'
  | 'userSelectedCount'
  | 'lineTotal'
  | 'discountPercent'
  | 'upgradeDiscount'
  | 'meta'
  | 'createdAt'
  | 'updatedAt'
>;

@Table({
  tableName: 'payment_items',
  indexes: [{ name: 'payment_items_payment_id_idx', fields: ['payment_id'] }],
})
export class PaymentItem extends BaseModel<PaymentItemAttributes, PaymentItemCreationAttributes> {
  @ForeignKey(() => Payment)
  @Column({ type: DataType.UUID, field: 'payment_id' })
  declare paymentId: string;

  @Column(DataType.UUID)
  declare productId: string;

  @Default('')
  @Column(DataType.STRING(128))
  declare productName: string;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  declare productPrice: number;

  @Default('')
  @Column(DataType.STRING(8))
  declare productCurrency: string;

  @Default(1)
  @Column(DataType.INTEGER)
  declare quantity: number;

  @Default(1)
  @Column(DataType.INTEGER)
  declare userSelectedCount: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  declare lineTotal: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  declare discountPercent: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  declare upgradeDiscount: number;

  @Default({})
  @Column(DataType.JSONB)
  declare meta: Record<string, any>;

  @BelongsTo(() => Payment)
  declare payment: Payment;
}
