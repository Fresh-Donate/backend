import {
  Table,
  Column,
  DataType,
  Default,
  AllowNull,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';
import type { ShopFieldValues, ShopSettingsSchema } from '@/types/shop-settings';

export type OwnerType = '' | 'individual' | 'self_employed' | 'sole_proprietor' | 'legal_entity';

interface ShopSettingsAttributes {
  id: string;
  shopUrl: string;
  fields: ShopFieldValues;
  fieldsSchema: ShopSettingsSchema | null;
  name: string;
  description: string;
  color: string;
  ip: string;
  ownerName: string;
  ownerType: OwnerType;
  ownerInn: string;
  contactEmail: string;
  cartEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type ShopSettingsCreationAttributes = Optional<ShopSettingsAttributes, 'id' | 'shopUrl' | 'fields' | 'fieldsSchema' | 'name' | 'description' | 'color' | 'ip' | 'ownerName' | 'ownerType' | 'ownerInn' | 'contactEmail' | 'cartEnabled' | 'createdAt' | 'updatedAt'>;

@Table({ tableName: 'shop_settings' })
export class ShopSettings extends BaseModel<ShopSettingsAttributes, ShopSettingsCreationAttributes> {
  @Default('http://localhost:3002')
  @Column(DataType.STRING(256))
  declare shopUrl: string;

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  declare fields: ShopFieldValues;

  @AllowNull(true)
  @Column(DataType.JSONB)
  declare fieldsSchema: ShopSettingsSchema | null;

  /** @deprecated Mirror of `fields.name` for rollback. Column is dropped in the next release. */
  @Default('FreshDonate Shop')
  @Column(DataType.STRING(64))
  declare name: string;

  /** @deprecated Mirror of `fields.description` for rollback. Column is dropped in the next release. */
  @Default('')
  @Column(DataType.STRING(500))
  declare description: string;

  /** @deprecated Mirror of `fields.color` for rollback. Column is dropped in the next release. */
  @Default('sky')
  @Column(DataType.STRING(32))
  declare color: string;

  /** @deprecated Mirror of `fields.ip` for rollback. Column is dropped in the next release. */
  @Default('play.example.com')
  @Column(DataType.STRING(64))
  declare ip: string;

  /** @deprecated Mirror of `fields.ownerName` for rollback. Column is dropped in the next release. */
  @Default('')
  @Column(DataType.STRING(256))
  declare ownerName: string;

  /** @deprecated Mirror of `fields.ownerType` for rollback. Column is dropped in the next release. */
  @Default('')
  @Column(DataType.STRING(32))
  declare ownerType: OwnerType;

  /** @deprecated Mirror of `fields.ownerInn` for rollback. Column is dropped in the next release. */
  @Default('')
  @Column(DataType.STRING(32))
  declare ownerInn: string;

  /** @deprecated Mirror of `fields.contactEmail` for rollback. Column is dropped in the next release. */
  @Default('')
  @Column(DataType.STRING(256))
  declare contactEmail: string;

  /** @deprecated Mirror of `fields.cartEnabled` for rollback. Column is dropped in the next release. */
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare cartEnabled: boolean;
}
