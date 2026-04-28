import {
  Table,
  Column,
  DataType,
  Default,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';
import type { CurrencyRates, SupportedCurrency } from '@/utils/currency';

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
  base_currency: SupportedCurrency;
  currency_rates: CurrencyRates;
  createdAt: Date;
  updatedAt: Date;
}

type SettingsCreationAttributes = Optional<
  SettingsAttributes,
  'id' | 'demo_payments' | 'delivery_method' | 'rcon_config' | 'plugin_config' | 'base_currency' | 'currency_rates' | 'createdAt' | 'updatedAt'
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

  @Default('RUB')
  @Column(DataType.STRING(8))
  declare base_currency: SupportedCurrency;

  @Default({ USD: 95, EUR: 100 })
  @Column(DataType.JSONB)
  declare currency_rates: CurrencyRates;
}
