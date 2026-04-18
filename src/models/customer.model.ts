import { Table, Column, DataType, HasMany } from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';
import { Payment } from './payment.model';

interface CustomerAttributes {
  id: string;
  nickname: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

type CustomerCreationAttributes = Optional<
    CustomerAttributes,
    'id' | 'createdAt' | 'updatedAt'
>;

@Table({ tableName: 'customers' })
export class Customer extends BaseModel<CustomerAttributes, CustomerCreationAttributes> {
  @Column(DataType.STRING(64))
  declare nickname: string;

  @Column(DataType.STRING(256))
  declare email: string;

  @HasMany(() => Payment)
  declare payments: Payment[];
}
