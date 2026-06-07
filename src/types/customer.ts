export interface CustomerCurrencyStats {
  currency: string;
  totalSpent: number;
  purchaseCount: number;
}

// Customer is no longer a stored entity - it's an aggregate view over paid
// payments grouped by nickname. `id` equals `nickname`.
export interface CustomerDto {
  id: string;
  nickname: string;
  email: string;
  stats: CustomerCurrencyStats[];
  createdAt: string;
  updatedAt: string;
}
