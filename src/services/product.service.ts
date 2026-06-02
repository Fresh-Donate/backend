import { literal } from 'sequelize';
import { Product } from '@/models/product.model';
import { Promotion } from '@/models/promotion.model';
import { Group } from '@/models/group.model';
import { Server } from '@/models/server.model';
import { NotFoundError } from '@/core';
import type { ProductDto, CreateProductDto, UpdateProductDto } from '@/types';
import {
  activePromotionsAt,
  applyDiscount,
  totalDiscountPercent,
} from './promotion.service';
import { assertServersExist } from './server.service';
import { SettingsService } from './settings.service';

function toDto(p: Product, now: Date = new Date()): ProductDto {
  const price = Number(p.price);
  const active = activePromotionsAt(p.promotions, now);
  const percent = totalDiscountPercent(active);
  const groups = (p.groups || []).map((g) => ({
    id: g.id,
    name: g.name,
    upgradeMode: g.upgradeMode,
  }));
  const servers = (p.servers || []).map((s) => ({ id: s.id, name: s.name }));
  const serverIds = servers.map((s) => s.id);
  return {
    id: p.id,
    name: p.name,
    price,
    currency: p.currency,
    quantity: p.quantity,
    description: p.description,
    type: p.type,
    commands: p.commands,
    imageUrl: p.imageUrl,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    allowCustomCount: p.allowCustomCount,
    forceDelivery: p.forceDelivery,
    activePromotions: active,
    discountPercent: percent,
    discountedPrice: applyDiscount(price, percent),
    groups,
    serverIds,
    servers,
  };
}

const PROMOTION_INCLUDE = {
  model: Promotion,
  through: { attributes: [] as string[] },
  required: false,
};

const GROUP_INCLUDE = {
  model: Group,
  through: { attributes: [] as string[] },
  required: false,
};

const SERVER_INCLUDE = {
  model: Server,
  attributes: ['id', 'name'] as string[],
  through: { attributes: [] as string[] },
  required: false,
};

export class ProductService {
  private settingsService = new SettingsService();

  async findAll(opts: { includeHidden?: boolean } = {}): Promise<ProductDto[]> {
    const settings = await this.settingsService.get();
    const hideUnservered = settings.multi_server_enabled && !opts.includeHidden;

    const where = hideUnservered
      ? literal(
        'EXISTS (SELECT 1 FROM product_servers ps '
        + 'JOIN servers s ON s.id = ps.server_id '
        + 'WHERE ps.product_id = "Product"."id" AND s.deleted_at IS NULL)',
      )
      : undefined;

    const products = await Product.findAll({
      order: [['created_at', 'DESC']],
      include: [PROMOTION_INCLUDE, GROUP_INCLUDE, SERVER_INCLUDE],
      ...(where ? { where: where as any } : {}),
    });
    const now = new Date();
    return products.map((p) => toDto(p, now));
  }

  async findById(id: string): Promise<ProductDto> {
    const product = await Product.findByPk(id, {
      include: [PROMOTION_INCLUDE, GROUP_INCLUDE, SERVER_INCLUDE],
    });
    if (!product) throw new NotFoundError(`Product with id "${id}" not found`);
    return toDto(product);
  }

  async create(data: CreateProductDto): Promise<ProductDto> {
    const serverIds = data.serverIds || [];
    if (serverIds.length > 0) {
      await assertServersExist(serverIds);
    }

    const forceDelivery = serverIds.length >= 2
      ? true
      : (data.forceDelivery || false);

    const product = await Product.create({
      name: data.name,
      price: data.price,
      currency: data.currency,
      quantity: data.quantity,
      description: data.description || '',
      type: data.type,
      commands: data.commands || [],
      imageUrl: data.imageUrl || '',
      allowCustomCount: data.allowCustomCount || false,
      forceDelivery,
    });

    if (serverIds.length > 0) {
      await (product as any).$set('servers', serverIds);
    }

    return toDto(await this.loadOne(product.id));
  }

  async update(id: string, data: UpdateProductDto): Promise<ProductDto> {
    const product = await Product.findByPk(id);
    if (!product) throw new NotFoundError(`Product with id "${id}" not found`);

    let resolvedForce = data.forceDelivery;
    if (data.serverIds !== undefined) {
      await assertServersExist(data.serverIds);
      if (data.serverIds.length >= 2) {
        resolvedForce = true;
      }
    }

    const patch: Record<string, unknown> = { ...data };
    delete patch.serverIds;
    if (resolvedForce !== undefined) patch.forceDelivery = resolvedForce;

    await product.update(patch);

    if (data.serverIds !== undefined) {
      await (product as any).$set('servers', data.serverIds);
    }

    return toDto(await this.loadOne(id));
  }

  async delete(id: string): Promise<void> {
    const product = await Product.findByPk(id);
    if (!product) throw new NotFoundError(`Product with id "${id}" not found`);
    await product.destroy();
  }

  async duplicate(id: string): Promise<ProductDto> {
    const source = await this.loadOne(id);

    const sourceServerIds = (source.servers || []).map((s) => s.id);
    const product = await Product.create({
      name: `${source.name} (копия)`,
      price: source.price,
      currency: source.currency,
      quantity: source.quantity,
      description: source.description,
      type: source.type,
      commands: [...source.commands],
      imageUrl: source.imageUrl,
      allowCustomCount: source.allowCustomCount,
      forceDelivery: source.forceDelivery,
    });

    if (sourceServerIds.length > 0) {
      await (product as any).$set('servers', sourceServerIds);
    }

    return toDto(await this.loadOne(product.id));
  }

  private async loadOne(id: string): Promise<Product> {
    const product = await Product.findByPk(id, {
      include: [PROMOTION_INCLUDE, GROUP_INCLUDE, SERVER_INCLUDE],
    });
    if (!product) throw new NotFoundError(`Product with id "${id}" not found`);
    return product;
  }
}
