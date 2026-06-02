import {
  Table,
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  BelongsToMany,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { Product } from './product.model';
import { ProductServer } from './product-server.model';

interface ServerAttributes {
  id: string;
  name: string;
  ip: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

type ServerCreationAttributes = Optional<
  ServerAttributes,
  'ip' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

@Table({ tableName: 'servers', paranoid: true })
export class Server extends Model<ServerAttributes, ServerCreationAttributes> {
  @PrimaryKey
  @Column(DataType.STRING(64))
  declare id: string;

  @Column(DataType.STRING(128))
  declare name: string;

  @Default('')
  @Column(DataType.STRING(256))
  declare ip: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  @DeletedAt
  @Column({ field: 'deleted_at' })
  declare deletedAt: Date | null;

  @BelongsToMany(() => Product, () => ProductServer)
  declare products: Product[];
}
