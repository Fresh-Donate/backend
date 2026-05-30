import {
  Table,
  Column,
  DataType,
  Default,
} from 'sequelize-typescript';
import { Optional } from 'sequelize';
import { BaseModel } from './base.model';
import type { CurrencyRates, SupportedCurrency } from '@/utils/currency';
import type { SmtpConfig, ReceiptTemplate } from '@/types/settings';

export type DeliveryMethod = 'rcon' | 'plugin';

interface RconConfig {
  host: string;
  port: number;
  password: string;
}

interface PluginConfig {
  token: string;
}

interface SettingsAttributes {
  id: string;
  demo_payments: boolean;
  delivery_method: DeliveryMethod;
  rcon_config: RconConfig;
  plugin_config: PluginConfig;
  base_currency: SupportedCurrency;
  currency_rates: CurrencyRates;
  telemetry_enabled: boolean;
  installation_id: string;
  smtp_config: SmtpConfig;
  receipt_template: ReceiptTemplate;
  createdAt: Date;
  updatedAt: Date;
}

type SettingsCreationAttributes = Optional<
  SettingsAttributes,
  'id' | 'demo_payments' | 'delivery_method' | 'rcon_config' | 'plugin_config' | 'base_currency' | 'currency_rates' | 'telemetry_enabled' | 'installation_id' | 'smtp_config' | 'receipt_template' | 'createdAt' | 'updatedAt'
>;

export const DEFAULT_SMTP_CONFIG: SmtpConfig = {
  enabled: false,
  host: '',
  port: 465,
  secure: true,
  user: '',
  password: '',
  fromEmail: '',
  fromName: '',
};

export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  subject: 'Чек о покупке — {productName} ({shopName})',
  html: `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Чек о покупке</title>
</head>
<body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e8eb;">
    <tr>
      <td style="padding:24px 28px;background:#0f172a;color:#ffffff;">
        <div style="font-size:13px;opacity:0.7;text-transform:uppercase;letter-spacing:0.06em;">{shopName}</div>
        <div style="font-size:22px;font-weight:700;margin-top:6px;">Спасибо за покупку!</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;">
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
          Привет, <strong>{nickname}</strong>! Мы получили вашу оплату.
          Это письмо — подтверждение покупки. Сохраните его — при обращении в поддержку
          сообщите номер заказа ниже.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;border-collapse:collapse;">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:13px;color:#6b7280;width:40%;">Номер заказа</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:13px;font-family:Menlo,Consolas,monospace;">{paymentId}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:13px;color:#6b7280;">Товар</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:14px;font-weight:600;">{productName}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:13px;color:#6b7280;">Количество</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:13px;">{quantity}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:13px;color:#6b7280;">Сумма</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:14px;font-weight:600;">{totalAmount} {currency}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:13px;color:#6b7280;">Платёжная система</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:13px;">{providerName}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:13px;color:#6b7280;">Никнейм</td>
            <td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:13px;font-family:Menlo,Consolas,monospace;">{nickname}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;font-size:13px;color:#6b7280;">Дата оплаты</td>
            <td style="padding:10px 0;font-size:13px;">{paidAt}</td>
          </tr>
        </table>

        <div style="margin-top:18px;padding:14px 16px;background:#f8fafc;border-radius:8px;font-size:13px;color:#475569;">
          Сервер: <strong>{shopIp}</strong><br />
          Магазин: <a href="{shopUrl}" style="color:#2563eb;text-decoration:none;">{shopUrl}</a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e6e8eb;font-size:12px;color:#6b7280;text-align:center;">
        Это автоматическое письмо. Отвечать на него не нужно.<br />
        Если есть вопросы — напишите на {contactEmail}.
      </td>
    </tr>
  </table>
</body>
</html>`,
};

@Table({ tableName: 'settings' })
export class Settings extends BaseModel<SettingsAttributes, SettingsCreationAttributes> {
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare demo_payments: boolean;

  @Default('rcon')
  @Column(DataType.STRING(16))
  declare delivery_method: DeliveryMethod;

  @Default({ host: '', port: 25575, password: '' })
  @Column(DataType.JSONB)
  declare rcon_config: RconConfig;

  @Default({ token: '' })
  @Column(DataType.JSONB)
  declare plugin_config: PluginConfig;

  @Default('RUB')
  @Column(DataType.STRING(8))
  declare base_currency: SupportedCurrency;

  @Default({ USD: 95, EUR: 100 })
  @Column(DataType.JSONB)
  declare currency_rates: CurrencyRates;

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare telemetry_enabled: boolean;

  @Default('')
  @Column(DataType.STRING(64))
  declare installation_id: string;

  @Default(DEFAULT_SMTP_CONFIG)
  @Column(DataType.JSONB)
  declare smtp_config: SmtpConfig;

  @Default(DEFAULT_RECEIPT_TEMPLATE)
  @Column(DataType.JSONB)
  declare receipt_template: ReceiptTemplate;
}
