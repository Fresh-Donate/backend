import { Table, Column, DataType, Model, ForeignKey, PrimaryKey } from 'sequelize-typescript';
import { Promotion } from './promotion.model';
import { Product } from './product.model';

@Table({ tableName: 'promotion_products', timestamps: false })
export class PromotionProduct extends Model {
  @PrimaryKey
  @ForeignKey(() => Promotion)
  @Column({ type: DataType.UUID, field: 'promotion_id' })
  declare promotionId: string;

  @PrimaryKey
  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, field: 'product_id' })
  declare productId: string;
}
