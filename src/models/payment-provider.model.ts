import {
  Table,
  Column,
  DataType,
  Default,
  Unique,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';

export interface CommissionRuleData {
  mode: 'seller' | 'buyer' | 'split';
  customPercent?: number;
}

interface PaymentProviderAttributes {
  id: string;
  providerId: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  testMode: boolean;
  credentials: Record<string, string>;
  /**
   * Structured provider-specific configuration that doesn't fit the flat
   * string-keyed `credentials` map. Used by Tebex to store the mapping of
   * coin-denomination → package_id for Headless API decomposition.
   */
  providerConfig: Record<string, any>;
  /**
   * Default commission percent charged by the provider.
   *
   * Applied up-front to build an estimate at checkout time. The actual final
   * commission is overwritten from webhook data when the provider reports
   * real fees (YooKassa's `income_amount`, Heleket's `commission`, …).
   */
  commissionPercent: number;
  commissionRule: CommissionRuleData;
  supportedCurrencies: string[];
  // Minimum acceptable payment amount
  minAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

type PaymentProviderCreationAttributes = Optional<
  PaymentProviderAttributes,
  'id' | 'enabled' | 'testMode' | 'credentials' | 'providerConfig' | 'commissionPercent' | 'commissionRule' | 'minAmount' | 'createdAt' | 'updatedAt'
>;

@Table({ tableName: 'payment_providers' })
export class PaymentProvider extends BaseModel<PaymentProviderAttributes, PaymentProviderCreationAttributes> {
  @Unique
  @Column(DataType.STRING(32))
  declare providerId: string;

  @Column(DataType.STRING(64))
  declare name: string;

  @Column(DataType.STRING(256))
  declare description: string;

  @Column(DataType.STRING(64))
  declare icon: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare enabled: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare testMode: boolean;

  @Default({})
  @Column(DataType.JSONB)
  declare credentials: Record<string, string>;

  @Default({})
  @Column(DataType.JSONB)
  declare providerConfig: Record<string, any>;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  declare commissionPercent: number;

  @Default({ mode: 'seller' })
  @Column(DataType.JSONB)
  declare commissionRule: CommissionRuleData;

  @Default([])
  @Column(DataType.JSONB)
  declare supportedCurrencies: string[];

  @Default(0.01)
  @Column(DataType.DECIMAL(10, 2))
  declare minAmount: number;
}
