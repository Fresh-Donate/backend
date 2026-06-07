import {
  Table,
  Column,
  DataType,
  Default,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';

export type OwnerType = '' | 'individual' | 'self_employed' | 'sole_proprietor' | 'legal_entity';

interface ShopSettingsAttributes {
  id: string;
  name: string;
  description: string;
  color: string;
  ip: string;
  shopUrl: string;
  ownerName: string;
  ownerType: OwnerType;
  ownerInn: string;
  contactEmail: string;
  cartEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type ShopSettingsCreationAttributes = Optional<ShopSettingsAttributes, 'id' | 'name' | 'description' | 'color' | 'ip' | 'shopUrl' | 'ownerName' | 'ownerType' | 'ownerInn' | 'contactEmail' | 'cartEnabled' | 'createdAt' | 'updatedAt'>;

@Table({ tableName: 'shop_settings' })
export class ShopSettings extends BaseModel<ShopSettingsAttributes, ShopSettingsCreationAttributes> {
  @Default('FreshDonate Shop')
  @Column(DataType.STRING(64))
  declare name: string;

  @Default('')
  @Column(DataType.STRING(500))
  declare description: string;

  @Default('sky')
  @Column(DataType.STRING(32))
  declare color: string;

  @Default('play.example.com')
  @Column(DataType.STRING(64))
  declare ip: string;

  @Default('http://localhost:3002')
  @Column(DataType.STRING(256))
  declare shopUrl: string;

  @Default('')
  @Column(DataType.STRING(256))
  declare ownerName: string;

  @Default('')
  @Column(DataType.STRING(32))
  declare ownerType: OwnerType;

  @Default('')
  @Column(DataType.STRING(32))
  declare ownerInn: string;

  @Default('')
  @Column(DataType.STRING(256))
  declare contactEmail: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare cartEnabled: boolean;
}
