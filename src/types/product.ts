import type { ProductPromotionDto } from './promotion';
import type { ProductGroupDto } from './group';

export interface ProductDto {
  id: string;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  description: string;
  type: string;
  commands: string[];
  imageUrl: string;
  allowCustomCount: boolean;
  forceDelivery: boolean;
  activePromotions: ProductPromotionDto[];
  discountPercent: number;
  discountedPrice: number;
  groups: ProductGroupDto[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductDto {
  name: string;
  price: number;
  currency: string;
  quantity: number;
  description?: string;
  type: string;
  commands?: string[];
  imageUrl?: string;
  allowCustomCount: boolean;
  forceDelivery?: boolean;
}

export interface UpdateProductDto {
  name?: string;
  price?: number;
  currency?: string;
  quantity?: number;
  description?: string;
  type?: string;
  commands?: string[];
  imageUrl?: string;
  allowCustomCount?: boolean;
  forceDelivery?: boolean;
}
