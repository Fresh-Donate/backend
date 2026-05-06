import {
  Table,
  Column,
  DataType,
  Default,
  BelongsToMany,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';
import { Promotion } from './promotion.model';
import { PromotionProduct } from './promotion-product.model';
import { Group } from './group.model';
import { GroupProduct } from './group-product.model';

interface ProductAttributes {
  id: string;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  description: string;
  type: string;
  commands: string[];
  imageUrl: string;
  allowCustomCount: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type ProductCreationAttributes = Optional<ProductAttributes, 'id' | 'description' | 'commands' | 'imageUrl' | 'allowCustomCount' | 'createdAt' | 'updatedAt'>;

@Table({ tableName: 'products' })
export class Product extends BaseModel<ProductAttributes, ProductCreationAttributes> {
  @Column(DataType.STRING(128))
  declare name: string;

  @Column(DataType.DECIMAL(10, 2))
  declare price: number;

  @Default('RUB')
  @Column(DataType.STRING(8))
  declare currency: string;

  @Default(1)
  @Column(DataType.INTEGER)
  declare quantity: number;

  @Default('')
  @Column(DataType.TEXT)
  declare description: string;

  @Column(DataType.STRING(32))
  declare type: string;

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare commands: string[];

  @Default('')
  @Column(DataType.STRING(512))
  declare imageUrl: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare allowCustomCount: boolean;

  @BelongsToMany(() => Promotion, () => PromotionProduct)
  declare promotions: Promotion[];

  @BelongsToMany(() => Group, () => GroupProduct)
  declare groups: Group[];
}
