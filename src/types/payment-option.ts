export interface PaymentOptionDto {
  id: string;
  name: string;
  icon: string;
  providerId: string;
  sortOrder: number;
  enabled: boolean;
}

export interface CreatePaymentOptionDto {
  name: string;
  icon: string;
  providerId: string;
  sortOrder?: number;
  enabled?: boolean;
}

export interface UpdatePaymentOptionDto {
  name?: string;
  icon?: string;
  providerId?: string;
  sortOrder?: number;
  enabled?: boolean;
}
