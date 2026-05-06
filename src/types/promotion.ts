export interface ProductPromotionDto {
  id: string;
  name: string;
  discountPercent: number;
}

export interface PromotionDto {
  id: string;
  name: string;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  productIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromotionDto {
  name: string;
  discountPercent: number;
  startsAt: string | Date;
  endsAt: string | Date;
  productIds: string[];
}

export interface UpdatePromotionDto {
  name?: string;
  discountPercent?: number;
  startsAt?: string | Date;
  endsAt?: string | Date;
  productIds?: string[];
}
