import { Op } from 'sequelize';
import { Group } from '@/models/group.model';
import { Product } from '@/models/product.model';
import { NotFoundError, ValidationError } from '@/core';

export interface GroupDto {
  id: string;
  name: string;
  upgradeMode: boolean;
  productIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupDto {
  name: string;
  upgradeMode?: boolean;
  productIds: string[];
}

export interface UpdateGroupDto {
  name?: string;
  upgradeMode?: boolean;
  productIds?: string[];
}

/**
 * Slim view of a group used in the products table — only the bits the
 * panel needs to render the «Группы» column with an upgrade-mode hint.
 */
export interface ProductGroupDto {
  id: string;
  name: string;
  upgradeMode: boolean;
}

function toDto(g: Group): GroupDto {
  return {
    id: g.id,
    name: g.name,
    upgradeMode: g.upgradeMode,
    productIds: (g.products || []).map((p) => p.id),
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export class GroupService {
  async findAll(): Promise<GroupDto[]> {
    const groups = await Group.findAll({
      include: [{ model: Product, attributes: ['id'], through: { attributes: [] as string[] } }],
      order: [['created_at', 'DESC']],
    });
    return groups.map(toDto);
  }

  async findById(id: string): Promise<GroupDto> {
    return toDto(await this.loadOne(id));
  }

  async create(data: CreateGroupDto): Promise<GroupDto> {
    if (!data.name?.trim()) throw new ValidationError('Group name is required');

    const group = await Group.create({
      name: data.name,
      upgradeMode: data.upgradeMode ?? false,
    });

    if (data.productIds && data.productIds.length > 0) {
      await this.assertProductsExist(data.productIds);
      await (group as any).$set('products', data.productIds);
    }

    return toDto(await this.loadOne(group.id));
  }

  async update(id: string, data: UpdateGroupDto): Promise<GroupDto> {
    const group = await this.loadOne(id);

    const patch: Partial<Pick<Group, 'name' | 'upgradeMode'>> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.upgradeMode !== undefined) patch.upgradeMode = data.upgradeMode;
    if (Object.keys(patch).length > 0) {
      await group.update(patch);
    }

    if (data.productIds !== undefined) {
      await this.assertProductsExist(data.productIds);
      await (group as any).$set('products', data.productIds);
    }

    return toDto(await this.loadOne(id));
  }

  async delete(id: string): Promise<void> {
    const group = await Group.findByPk(id);
    if (!group) throw new NotFoundError(`Group with id "${id}" not found`);
    await group.destroy();
  }

  private async loadOne(id: string): Promise<Group> {
    const group = await Group.findByPk(id, {
      include: [{ model: Product, attributes: ['id'], through: { attributes: [] as string[] } }],
    });
    if (!group) throw new NotFoundError(`Group with id "${id}" not found`);
    return group;
  }

  private async assertProductsExist(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await Product.count({ where: { id: { [Op.in]: ids } } });
    if (found !== ids.length) {
      throw new ValidationError('One or more productIds do not exist');
    }
  }
}
