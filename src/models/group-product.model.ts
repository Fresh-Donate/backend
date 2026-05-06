import { Table, Column, DataType, Model, ForeignKey, PrimaryKey } from 'sequelize-typescript';
import { Group } from './group.model';
import { Product } from './product.model';

@Table({ tableName: 'group_products', timestamps: false })
export class GroupProduct extends Model {
  @PrimaryKey
  @ForeignKey(() => Group)
  @Column({ type: DataType.UUID, field: 'group_id' })
  declare groupId: string;

  @PrimaryKey
  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, field: 'product_id' })
  declare productId: string;
}
