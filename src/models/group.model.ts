import { Table, Column, DataType, Default, BelongsToMany } from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';
import { Product } from './product.model';
import { GroupProduct } from './group-product.model';

interface GroupAttributes {
  id: string;
  name: string;
  /**
   * "Доплата" mode. When true, buying a product in this group is blocked
   * if the customer has already paid for an equally- or higher-priced
   * product from the same group; otherwise the latest in-group purchase's
   * current price is subtracted from the new product's price.
   */
  upgradeMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type GroupCreationAttributes = Optional<
  GroupAttributes,
  'id' | 'upgradeMode' | 'createdAt' | 'updatedAt'
>;

@Table({ tableName: 'groups' })
export class Group extends BaseModel<GroupAttributes, GroupCreationAttributes> {
  @Column(DataType.STRING(128))
  declare name: string;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, field: 'upgrade_mode' })
  declare upgradeMode: boolean;

  @BelongsToMany(() => Product, () => GroupProduct)
  declare products: Product[];
}
