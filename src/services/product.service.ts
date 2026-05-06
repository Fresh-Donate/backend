import { Product } from '@/models/product.model';
import { Promotion } from '@/models/promotion.model';
import { Group } from '@/models/group.model';
import { NotFoundError } from '@/core';
import type { ProductDto, CreateProductDto, UpdateProductDto } from '@/types';
import {
  activePromotionsAt,
  applyDiscount,
  totalDiscountPercent,
} from './promotion.service';

function toDto(p: Product, now: Date = new Date()): ProductDto {
  const price = Number(p.price);
  const active = activePromotionsAt(p.promotions, now);
  const percent = totalDiscountPercent(active);
  const groups = (p.groups || []).map((g) => ({
    id: g.id,
    name: g.name,
    upgradeMode: g.upgradeMode,
  }));
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
    activePromotions: active,
    discountPercent: percent,
    discountedPrice: applyDiscount(price, percent),
    groups,
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

export class ProductService {
  async findAll(): Promise<ProductDto[]> {
    const products = await Product.findAll({
      order: [['created_at', 'DESC']],
      include: [PROMOTION_INCLUDE, GROUP_INCLUDE],
    });
    const now = new Date();
    return products.map((p) => toDto(p, now));
  }

  async findById(id: string): Promise<ProductDto> {
    const product = await Product.findByPk(id, { include: [PROMOTION_INCLUDE, GROUP_INCLUDE] });
    if (!product) throw new NotFoundError(`Product with id "${id}" not found`);
    return toDto(product);
  }

  async create(data: CreateProductDto): Promise<ProductDto> {
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
    });
    return toDto(product);
  }

  async update(id: string, data: UpdateProductDto): Promise<ProductDto> {
    const product = await Product.findByPk(id);
    if (!product) throw new NotFoundError(`Product with id "${id}" not found`);
    await product.update(data);
    const reloaded = await Product.findByPk(id, { include: [PROMOTION_INCLUDE, GROUP_INCLUDE] });
    return toDto(reloaded!);
  }

  async delete(id: string): Promise<void> {
    const product = await Product.findByPk(id);
    if (!product) throw new NotFoundError(`Product with id "${id}" not found`);
    await product.destroy();
  }

  async duplicate(id: string): Promise<ProductDto> {
    const source = await Product.findByPk(id);
    if (!source) throw new NotFoundError(`Product with id "${id}" not found`);

    const product = await Product.create({
      name: `${source.name} (копия)`,
      price: source.price,
      currency: source.currency,
      quantity: source.quantity,
      description: source.description,
      type: source.type,
      commands: [...source.commands],
      imageUrl: source.imageUrl,
    });

    return toDto(product);
  }
}
