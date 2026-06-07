import {
  Table,
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  ForeignKey,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { Payment } from './payment.model';
import { Server } from './server.model';

export type PaymentDeliveryStatus = 'pending' | 'delivered' | 'failed';

interface PaymentDeliveryAttributes {
  id: string;
  paymentId: string;
  serverId: string;
  status: PaymentDeliveryStatus;
  deliveredAt: Date | null;
  meta: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

type PaymentDeliveryCreationAttributes = Optional<
  PaymentDeliveryAttributes,
  'id' | 'status' | 'deliveredAt' | 'meta' | 'createdAt' | 'updatedAt'
>;

@Table({
  tableName: 'payment_deliveries',
  indexes: [
    { name: 'payment_deliveries_payment_server_unique', unique: true, fields: ['payment_id', 'server_id'] },
  ],
})
export class PaymentDelivery extends Model<PaymentDeliveryAttributes, PaymentDeliveryCreationAttributes> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Payment)
  @Column({ type: DataType.UUID, field: 'payment_id' })
  declare paymentId: string;

  @ForeignKey(() => Server)
  @Column({ type: DataType.STRING(64), field: 'server_id' })
  declare serverId: string;

  @Default('pending')
  @Column(DataType.STRING(16))
  declare status: PaymentDeliveryStatus;

  @Column({ type: DataType.DATE, field: 'delivered_at' })
  declare deliveredAt: Date | null;

  @Default({})
  @Column(DataType.JSONB)
  declare meta: Record<string, any>;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
