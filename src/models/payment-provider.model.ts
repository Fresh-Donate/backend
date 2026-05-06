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
   * Default commission percent charged by the provider.
   *
   * Applied up-front to build an estimate at checkout time. The actual final
   * commission is overwritten from webhook data when the provider reports
   * real fees (YooKassa's `income_amount`, Heleket's `commission`, …).
   */
  commissionPercent: number;
  commissionRule: CommissionRuleData;
  supportedCurrencies: string[];
  createdAt: Date;
  updatedAt: Date;
}

type PaymentProviderCreationAttributes = Optional<
  PaymentProviderAttributes,
  'id' | 'enabled' | 'testMode' | 'credentials' | 'commissionPercent' | 'commissionRule' | 'createdAt' | 'updatedAt'
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

  /**
   * When true, the provider talks to its sandbox / test environment.
   * Not all providers support a sandbox — gateways that ignore this flag
   * will simply behave as in production.
   */
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare testMode: boolean;

  @Default({})
  @Column(DataType.JSONB)
  declare credentials: Record<string, string>;

  /**
   * Default commission percent (0–100). Used as the up-front estimate when
   * creating a payment; overwritten by real values from webhook data.
   */
  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  declare commissionPercent: number;

  @Default({ mode: 'seller' })
  @Column(DataType.JSONB)
  declare commissionRule: CommissionRuleData;

  @Default([])
  @Column(DataType.JSONB)
  declare supportedCurrencies: string[];
}
