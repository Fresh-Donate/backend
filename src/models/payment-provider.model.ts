import {
  Table,
  Column,
  DataType,
  Default,
  Unique,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';

export interface PaymentMethodData {
  id: string;
  name: string;
  commission: number;
  enabled: boolean;
}

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
  methods: PaymentMethodData[];
  commissionRule: CommissionRuleData;
  supportedCurrencies: string[];
  createdAt: Date;
  updatedAt: Date;
}

type PaymentProviderCreationAttributes = Optional<
  PaymentProviderAttributes,
  'id' | 'enabled' | 'testMode' | 'credentials' | 'methods' | 'commissionRule' | 'createdAt' | 'updatedAt'
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

  @Default([])
  @Column(DataType.JSONB)
  declare methods: PaymentMethodData[];

  @Default({ mode: 'seller' })
  @Column(DataType.JSONB)
  declare commissionRule: CommissionRuleData;

  @Default([])
  @Column(DataType.JSONB)
  declare supportedCurrencies: string[];
}
