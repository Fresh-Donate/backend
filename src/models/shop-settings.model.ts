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
  ip: string;
  /**
   * Public origin where the storefront is hosted (e.g. `https://shop.example.com`).
   * Source of truth for canonical URLs, Open Graph, sitemap, robots.txt and
   * the panel's "open shop" button. No trailing slash.
   */
  shopUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

type ShopSettingsCreationAttributes = Optional<ShopSettingsAttributes, 'id' | 'name' | 'description' | 'color' | 'ip' | 'shopUrl' | 'createdAt' | 'updatedAt'>;

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
}
