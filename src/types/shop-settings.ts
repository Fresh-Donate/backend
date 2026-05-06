import type { OwnerType } from '@/models/shop-settings.model';

export interface ShopSettingsDto {
  name: string;
  description: string;
  color: string;
  ip: string;
  shopUrl: string;
  ownerName: string;
  ownerType: OwnerType;
  ownerInn: string;
  contactEmail: string;
}
