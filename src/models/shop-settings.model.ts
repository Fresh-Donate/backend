import {
  Table,
  Column,
  DataType,
  Default,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';

/**
 * Closed list of "who runs this shop" categories used in the public legal
 * pages. Empty string means the admin chose not to disclose — the legal
 * pages then render "не указано" placeholders rather than fabricating data.
 */
export type OwnerType = '' | 'individual' | 'self_employed' | 'sole_proprietor' | 'legal_entity';

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
  // Identifying info shown on the public legal pages (offer / terms /
  // privacy). All optional — admin can leave them blank if they don't want
  // to disclose. INN/contact email are recommended though, since 152-ФЗ
  // requires a contact for data-subject requests.
  ownerName: string;
  ownerType: OwnerType;
  ownerInn: string;
  contactEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

type ShopSettingsCreationAttributes = Optional<ShopSettingsAttributes, 'id' | 'name' | 'description' | 'color' | 'ip' | 'shopUrl' | 'ownerName' | 'ownerType' | 'ownerInn' | 'contactEmail' | 'createdAt' | 'updatedAt'>;

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
}
