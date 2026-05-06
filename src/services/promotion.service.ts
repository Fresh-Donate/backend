import { Op } from 'sequelize';
import { Promotion } from '@/models/promotion.model';
import { Product } from '@/models/product.model';
import { NotFoundError, ValidationError } from '@/core';
import type {
  PromotionDto,
  CreatePromotionDto,
  UpdatePromotionDto,
  ProductPromotionDto,
} from '@/types';

function toDto(p: Promotion): PromotionDto {
  return {
    id: p.id,
    name: p.name,
    discountPercent: Number(p.discountPercent),
    startsAt: p.startsAt instanceof Date ? p.startsAt.toISOString() : new Date(p.startsAt).toISOString(),
    endsAt: p.endsAt instanceof Date ? p.endsAt.toISOString() : new Date(p.endsAt).toISOString(),
    productIds: (p.products || []).map((prod) => prod.id),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// Used both at product-listing time (for the badge / struck-through price) and
// at payment-creation time (for the actual charge). Keeping it one helper is
// what guarantees displayed price === charged price.
export function activePromotionsAt(
  promotions: Promotion[] | undefined,
  now: Date = new Date(),
): ProductPromotionDto[] {
  if (!promotions || promotions.length === 0) return [];
  return promotions
    .filter((p) => p.startsAt <= now && p.endsAt >= now)
    .map((p) => ({
      id: p.id,
      name: p.name,
      discountPercent: Number(p.discountPercent),
    }));
}

// Stacking is the explicit product requirement; cap at 100 to keep the math
// safe (no negative prices, no >100% nonsense).
export function totalDiscountPercent(active: ProductPromotionDto[]): number {
  if (active.length === 0) return 0;
  return Math.min(active.reduce((acc, p) => acc + p.discountPercent, 0), 100);
}

// Round to 2 decimals to match `DECIMAL(10, 2)` on the products table —
// otherwise float drift accumulates between display and charge.
export function applyDiscount(price: number, percent: number): number {
  if (percent <= 0) return Math.round(price * 100) / 100;
  return Math.max(0, Math.round(price * (1 - percent / 100) * 100) / 100);
}

export class PromotionService {
  async findAll(): Promise<PromotionDto[]> {
    const promotions = await Promotion.findAll({
      include: [{ model: Product, attributes: ['id'], through: { attributes: [] } }],
      order: [['created_at', 'DESC']],
    });
    return promotions.map(toDto);
  }

  async findById(id: string): Promise<PromotionDto> {
    return toDto(await this.loadOne(id));
  }

  async create(data: CreatePromotionDto): Promise<PromotionDto> {
    this.validateInput(data.discountPercent, data.startsAt, data.endsAt);

    const promotion = await Promotion.create({
      name: data.name,
      discountPercent: data.discountPercent,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
    });

    if (data.productIds && data.productIds.length > 0) {
      await this.assertProductsExist(data.productIds);
      await (promotion as any).$set('products', data.productIds);
    }

    return toDto(await this.loadOne(promotion.id));
  }

  async update(id: string, data: UpdatePromotionDto): Promise<PromotionDto> {
    const promotion = await this.loadOne(id);

    if (data.discountPercent !== undefined || data.startsAt !== undefined || data.endsAt !== undefined) {
      this.validateInput(
        data.discountPercent ?? promotion.discountPercent,
        data.startsAt ?? promotion.startsAt,
        data.endsAt ?? promotion.endsAt,
      );
    }

    const patch: Partial<Pick<Promotion, 'name' | 'discountPercent' | 'startsAt' | 'endsAt'>> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.discountPercent !== undefined) patch.discountPercent = data.discountPercent;
    if (data.startsAt !== undefined) patch.startsAt = new Date(data.startsAt);
    if (data.endsAt !== undefined) patch.endsAt = new Date(data.endsAt);
    if (Object.keys(patch).length > 0) {
      await promotion.update(patch);
    }

    if (data.productIds !== undefined) {
      await this.assertProductsExist(data.productIds);
      await (promotion as any).$set('products', data.productIds);
    }

    return toDto(await this.loadOne(id));
  }

  async delete(id: string): Promise<void> {
    const promotion = await Promotion.findByPk(id);
    if (!promotion) throw new NotFoundError(`Promotion with id "${id}" not found`);
    await promotion.destroy();
  }

  private async loadOne(id: string): Promise<Promotion> {
    const promotion = await Promotion.findByPk(id, {
      include: [{ model: Product, attributes: ['id'], through: { attributes: [] } }],
    });
    if (!promotion) throw new NotFoundError(`Promotion with id "${id}" not found`);
    return promotion;
  }

  private validateInput(percent: number, startsAt: string | Date, endsAt: string | Date): void {
    const p = Number(percent);
    if (!Number.isFinite(p) || p < 1 || p > 100) {
      throw new ValidationError('discountPercent must be between 1 and 100');
    }
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      throw new ValidationError('startsAt / endsAt must be valid dates');
    }
    if (e <= s) {
      throw new ValidationError('endsAt must be after startsAt');
    }
  }

  private async assertProductsExist(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await Product.count({ where: { id: { [Op.in]: ids } } });
    if (found !== ids.length) {
      throw new ValidationError('One or more productIds do not exist');
    }
  }
}
