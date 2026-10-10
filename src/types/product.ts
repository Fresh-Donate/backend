import type { ProductPromotionDto } from './promotion';
import type { ProductGroupDto } from './group';

export interface ProductServerSummary {
  id: string;
  name: string;
}

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
  serverIds: string[];
  servers: ProductServerSummary[];
  createdAt: Date;
  updatedAt: Date;
}

export type PublicProductDto = Pick<
  ProductDto,
  'id' | 'name' | 'price' | 'currency' | 'quantity' | 'description' | 'type' | 'imageUrl'
  | 'allowCustomCount' | 'activePromotions' | 'discountPercent' | 'discountedPrice' | 'servers'
>;

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
  serverIds?: string[];
  groupIds?: string[];
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
  serverIds?: string[];
  groupIds?: string[];
}
