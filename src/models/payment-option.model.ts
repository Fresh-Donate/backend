import {
  Table,
  Column,
  DataType,
  Default,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';

interface PaymentOptionAttributes {
  id: string;
  name: string;
  icon: string;
  providerId: string;
  redirectUrl: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type PaymentOptionCreationAttributes = Optional<
  PaymentOptionAttributes,
  'id' | 'providerId' | 'redirectUrl' | 'sortOrder' | 'enabled' | 'createdAt' | 'updatedAt'
>;

@Table({ tableName: 'payment_options' })
export class PaymentOption extends BaseModel<PaymentOptionAttributes, PaymentOptionCreationAttributes> {
  @Column(DataType.STRING(128))
  declare name: string;

  @Column(DataType.STRING(128))
  declare icon: string;

  @Default('')
  @Column(DataType.STRING(32))
  declare providerId: string;

  @Default(null)
  @Column(DataType.STRING(1024))
  declare redirectUrl: string | null;

  @Default(0)
  @Column(DataType.INTEGER)
  declare sortOrder: number;

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare enabled: boolean;
}
