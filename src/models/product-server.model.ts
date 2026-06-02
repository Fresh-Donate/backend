import { Table, Column, DataType, Model, ForeignKey, PrimaryKey } from 'sequelize-typescript';
import { Product } from './product.model';
import { Server } from './server.model';

@Table({ tableName: 'product_servers', timestamps: false })
export class ProductServer extends Model {
  @PrimaryKey
  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, field: 'product_id' })
  declare productId: string;

  @PrimaryKey
  @ForeignKey(() => Server)
  @Column({ type: DataType.STRING(64), field: 'server_id' })
  declare serverId: string;
}
