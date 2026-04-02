import {
  Table,
  Column,
  DataType,
  Default,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';

interface SettingsAttributes {
  id: string;
  demo_payments: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type SettingsCreationAttributes = Optional<SettingsAttributes, 'id' | 'demo_payments' | 'createdAt' | 'updatedAt'>;

@Table({ tableName: 'settings' })
export class Settings extends BaseModel<SettingsAttributes, SettingsCreationAttributes> {
  @Default(false)
  @Column(DataType.BOOLEAN())
  declare demo_payments: boolean;
}
