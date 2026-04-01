import {
  Table,
  Column,
  DataType,
  Default,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';

interface ShopSettingsAttributes {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

type ShopSettingsCreationAttributes = Optional<ShopSettingsAttributes, 'id' | 'name' | 'description' | 'color' | 'createdAt' | 'updatedAt'>;

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
}
