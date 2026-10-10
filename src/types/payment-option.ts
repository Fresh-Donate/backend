export interface PaymentOptionDto {
  id: string;
  name: string;
  icon: string;
  providerId: string;
  redirectUrl: string | null;
  sortOrder: number;
  enabled: boolean;
}

export type PublicPaymentOptionDto = Pick<PaymentOptionDto, 'id' | 'name' | 'icon' | 'redirectUrl'>;

export interface CreatePaymentOptionDto {
  name: string;
  icon: string;
  providerId?: string;
  redirectUrl?: string | null;
  sortOrder?: number;
  enabled?: boolean;
}

export interface UpdatePaymentOptionDto {
  name?: string;
  icon?: string;
  providerId?: string;
  redirectUrl?: string | null;
  sortOrder?: number;
  enabled?: boolean;
}
