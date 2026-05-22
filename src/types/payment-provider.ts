import type { CommissionRuleData } from '@/models/payment-provider.model';

export interface PaymentProviderDto {
  id: string;
  providerId: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  testMode: boolean;
  credentials: Record<string, string>;
  providerConfig: Record<string, any>;
  commissionPercent: number;
  commissionRule: CommissionRuleData;
  supportedCurrencies: string[];
}

export interface UpdatePaymentProviderDto {
  enabled?: boolean;
  testMode?: boolean;
  credentials?: Record<string, string>;
  providerConfig?: Record<string, any>;
  commissionPercent?: number;
  commissionRule?: CommissionRuleData;
  supportedCurrencies?: string[];
}
