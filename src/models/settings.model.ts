import {
  Table,
  Column,
  DataType,
  Default,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';

export type DeliveryMethod = 'rcon' | 'plugin';

interface RconConfig {
  host: string;
  port: number;
  password: string;
}

interface PluginConfig {
  token: string;
}

interface SettingsAttributes {
  id: string;
  demo_payments: boolean;
  delivery_method: DeliveryMethod;
  rcon_config: RconConfig;
  plugin_config: PluginConfig;
  createdAt: Date;
  updatedAt: Date;
}

type SettingsCreationAttributes = Optional<
  SettingsAttributes,
  'id' | 'demo_payments' | 'delivery_method' | 'rcon_config' | 'plugin_config' | 'createdAt' | 'updatedAt'
>;

@Table({ tableName: 'settings' })
export class Settings extends BaseModel<SettingsAttributes, SettingsCreationAttributes> {
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare demo_payments: boolean;

  @Default('rcon')
  @Column(DataType.STRING(16))
  declare delivery_method: DeliveryMethod;

  @Default({ host: '', port: 25575, password: '' })
  @Column(DataType.JSONB)
  declare rcon_config: RconConfig;

  @Default({ token: '' })
  @Column(DataType.JSONB)
  declare plugin_config: PluginConfig;
}
