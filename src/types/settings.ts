import type { DeliveryMethod } from '@/models/settings.model';
import type { CurrencyRates, SupportedCurrency } from '@/utils/currency';

export interface SettingsDto {
  demo_payments: boolean;
  delivery_method: DeliveryMethod;
  rcon_config: {
    host: string;
    port: number;
    password: string;
  };
  plugin_config: {
    token: string;
  };
  base_currency: SupportedCurrency;
  currency_rates: CurrencyRates;
  telemetry_enabled: boolean;
  installation_id: string;
}
