import {
  Table,
  Column,
  DataType,
  Default,
  HasMany,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';
import { Payment } from './payment.model';

interface CustomerAttributes {
  id: string;
  nickname: string;
  email: string;
  totalSpent: number;
  purchaseCount: number;
  createdAt: Date;
  updatedAt: Date;
}

type CustomerCreationAttributes = Optional<
  CustomerAttributes,
  'id' | 'totalSpent' | 'purchaseCount' | 'createdAt' | 'updatedAt'
>;

@Table({ tableName: 'customers' })
export class Customer extends BaseModel<CustomerAttributes, CustomerCreationAttributes> {
  @Column(DataType.STRING(64))
  declare nickname: string;

  @Column(DataType.STRING(256))
  declare email: string;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  declare totalSpent: number;

  @Default(0)
  @Column(DataType.INTEGER)
  declare purchaseCount: number;

  @HasMany(() => Payment)
  declare payments: Payment[];
}
