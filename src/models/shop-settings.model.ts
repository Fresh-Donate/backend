import {
  Table,
  Column,
  DataType,
  Default,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';

/**
 * Currency conversion rates relative to RUB — the platform's base currency.
 *
 * Each entry is "how many RUB in 1 unit of the given currency", e.g.
 * `{ USD: 95.5, EUR: 102.3 }` means 1 USD = 95.5 RUB and 1 EUR = 102.3 RUB.
 * RUB itself is always 1 and is intentionally not stored here.
 *
 * Used wherever amounts in mixed currencies need to be compared or summed
 * (sorting customers by total spent, dashboard totals, etc.).
 */
export type CurrencyRates = Record<string, number>;

interface ShopSettingsAttributes {
  id: string;
  name: string;
  description: string;
  color: string;
  ip: string;
  /**
   * Public origin where the storefront is hosted (e.g. `https://shop.example.com`).
   * Source of truth for canonical URLs, Open Graph, sitemap, robots.txt and
   * the panel's "open shop" button. No trailing slash.
   */
  shopUrl: string;
  currencyRates: CurrencyRates;
  createdAt: Date;
  updatedAt: Date;
}

type ShopSettingsCreationAttributes = Optional<ShopSettingsAttributes, 'id' | 'name' | 'description' | 'color' | 'ip' | 'shopUrl' | 'currencyRates' | 'createdAt' | 'updatedAt'>;

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

  @Default({ USD: 95, EUR: 100 })
  @Column(DataType.JSONB)
  declare currencyRates: CurrencyRates;
}
