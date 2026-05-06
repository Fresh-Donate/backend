import { Table, Column, DataType, BelongsToMany } from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';
import { Product } from './product.model';
import { PromotionProduct } from './promotion-product.model';

interface PromotionAttributes {
  id: string;
  name: string;
  discountPercent: number;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type PromotionCreationAttributes = Optional<
  PromotionAttributes,
  'id' | 'createdAt' | 'updatedAt'
>;

@Table({ tableName: 'promotions' })
export class Promotion extends BaseModel<PromotionAttributes, PromotionCreationAttributes> {
  @Column(DataType.STRING(128))
  declare name: string;

  @Column({ type: DataType.SMALLINT, field: 'discount_percent' })
  declare discountPercent: number;

  @Column({ type: DataType.DATE, field: 'starts_at' })
  declare startsAt: Date;

  @Column({ type: DataType.DATE, field: 'ends_at' })
  declare endsAt: Date;

  @BelongsToMany(() => Product, () => PromotionProduct)
  declare products: Product[];
}
