export interface CustomerCurrencyStats {
  currency: string;
  totalSpent: number;
  purchaseCount: number;
}

export interface CustomerDto {
  id: string;
  nickname: string;
  email: string;
  stats: CustomerCurrencyStats[];
  createdAt: string;
  updatedAt: string;
}
