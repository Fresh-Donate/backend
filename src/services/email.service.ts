import nodemailer, { type Transporter } from 'nodemailer';
import { Payment } from '@/models/payment.model';
import { Product } from '@/models/product.model';
import { SettingsService } from './settings.service';
import { ShopSettingsService } from './shop-settings.service';
import type { SmtpConfig, ReceiptTemplate } from '@/types';
import { ValidationError } from '@/core';

const PROVIDER_NAMES: Record<string, string> = {
  yookassa: 'ЮKassa',
  heleket: 'Heleket',
  wata: 'Wata',
  robokassa: 'Robokassa',
  cryptobot: 'CryptoBot',
  tebex: 'Tebex',
};

export const RECEIPT_PLACEHOLDERS: { key: string; description: string }[] = [
  { key: 'paymentId', description: 'Полный ID заказа' },
  { key: 'paymentIdShort', description: 'Короткий ID (первые 8 символов)' },
  { key: 'nickname', description: 'Никнейм покупателя' },
  { key: 'email', description: 'Email покупателя' },
  { key: 'productName', description: 'Название товара' },
  { key: 'productId', description: 'ID товара' },
  { key: 'quantity', description: 'Итоговое количество' },
  { key: 'userSelectedCount', description: 'Сколько штук выбрал покупатель' },
  { key: 'productPrice', description: 'Цена за единицу' },
  { key: 'productCurrency', description: 'Валюта товара' },
  { key: 'totalAmount', description: 'Итоговая сумма' },
  { key: 'currency', description: 'Валюта оплаты' },
  { key: 'providerName', description: 'Платёжная система (читаемое имя)' },
  { key: 'providerId', description: 'ID платёжной системы' },
  { key: 'externalPaymentId', description: 'ID платежа в системе' },
  { key: 'paidAt', description: 'Дата и время оплаты' },
  { key: 'status', description: 'Текущий статус заказа' },
  { key: 'shopName', description: 'Название магазина' },
  { key: 'shopUrl', description: 'Адрес магазина' },
  { key: 'shopIp', description: 'IP сервера' },
  { key: 'contactEmail', description: 'Email для связи' },
];

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(value);
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildVars(payload: {
  payment: Payment | null;
  product: Product | null;
  shop: { name: string; ip: string; shopUrl: string; contactEmail: string };
  isPreview?: boolean;
}): Record<string, string> {
  const { payment, product, shop } = payload;

  const productName = payment?.productName || product?.name || 'Демо-товар';
  const quantity = payment
    ? String((product?.quantity ?? payment.quantity ?? 1) * (payment.userSelectedCount || 1))
    : '1';
  const providerId = payment?.providerId || '-';
  const providerName = providerId === '-' ? '-' : (PROVIDER_NAMES[providerId] || providerId);

  return {
    paymentId: payment?.id || 'preview-payment-id',
    paymentIdShort: (payment?.id || 'preview12').slice(0, 8),
    nickname: payment?.customerNickname || 'Steve',
    email: payment?.customerEmail || 'buyer@example.com',
    productName,
    productId: payment?.productId || product?.id || '-',
    quantity,
    userSelectedCount: String(payment?.userSelectedCount || 1),
    productPrice: formatMoney(Number(payment?.productPrice ?? product?.price ?? 0)),
    productCurrency: payment?.productCurrency || product?.currency || 'RUB',
    totalAmount: formatMoney(Number(payment?.totalAmount ?? product?.price ?? 0)),
    currency: payment?.currency || product?.currency || 'RUB',
    providerName,
    providerId,
    externalPaymentId: payment?.externalPaymentId || '-',
    paidAt: formatDate(payment?.paidAt ?? new Date()),
    status: payment?.status || 'paid',
    shopName: shop.name || 'FreshDonate Shop',
    shopUrl: shop.shopUrl || '',
    shopIp: shop.ip || '',
    contactEmail: shop.contactEmail || '',
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class EmailService {
  private settingsService = new SettingsService();
  private shopSettingsService = new ShopSettingsService();

  private buildTransporter(smtp: SmtpConfig): Transporter {
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user || smtp.password ? { user: smtp.user, pass: smtp.password } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }

  private from(smtp: SmtpConfig): string {
    const email = smtp.fromEmail || smtp.user;
    if (!email) return '';
    return smtp.fromName ? `${smtp.fromName} <${email}>` : email;
  }

  private async sendRendered(
    to: string,
    subject: string,
    html: string,
    smtp: SmtpConfig,
  ): Promise<void> {
    const transporter = this.buildTransporter(smtp);
    try {
      await transporter.sendMail({
        from: this.from(smtp),
        to,
        subject,
        html,
        text: htmlToText(html),
      });
    } finally {
      transporter.close();
    }
  }

  async sendPurchaseConfirmation(paymentId: string): Promise<{ sent: boolean; reason?: string }> {
    const settings = await this.settingsService.get();

    if (!settings.smtp_config.enabled) {
      return { sent: false, reason: 'smtp_disabled' };
    }
    if (!settings.smtp_config.host) {
      return { sent: false, reason: 'smtp_not_configured' };
    }

    const payment = await Payment.findByPk(paymentId);
    if (!payment) return { sent: false, reason: 'payment_not_found' };
    if (!payment.customerEmail) return { sent: false, reason: 'no_email' };
    if (payment.meta?.confirmationEmailSentAt) {
      return { sent: false, reason: 'already_sent' };
    }
    if (payment.meta?.demo) {
      return { sent: false, reason: 'demo_payment' };
    }

    const product = await Product.findByPk(payment.productId);
    const shop = await this.shopSettingsService.get();

    const vars = buildVars({
      payment,
      product,
      shop: {
        name: shop.name,
        ip: shop.ip,
        shopUrl: shop.shopUrl,
        contactEmail: shop.contactEmail,
      },
    });

    const subject = renderTemplate(settings.receipt_template.subject, vars);
    const html = renderTemplate(settings.receipt_template.html, varsForHtml(vars));

    try {
      await this.sendRendered(payment.customerEmail, subject, html, settings.smtp_config);

      await payment.update({
        meta: {
          ...payment.meta,
          confirmationEmailSentAt: new Date().toISOString(),
        },
      });
      payment.changed('meta', true);
      await payment.save();

      console.log(`Email: receipt sent for payment ${payment.id} to ${payment.customerEmail}`);
      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Email: failed to send receipt for payment ${payment.id}: ${message}`);
      return { sent: false, reason: 'send_failed' };
    }
  }

  async resendPurchaseConfirmation(paymentId: string): Promise<{ sent: boolean; reason?: string }> {
    const payment = await Payment.findByPk(paymentId);
    if (!payment) throw new ValidationError('Payment not found');
    if (!payment.customerEmail) throw new ValidationError('Payment has no email');

    if (payment.meta?.confirmationEmailSentAt) {
      const newMeta = { ...payment.meta };
      delete newMeta.confirmationEmailSentAt;
      await payment.update({ meta: newMeta });
      payment.changed('meta', true);
      await payment.save();
    }

    return this.sendPurchaseConfirmation(paymentId);
  }

  async sendTestEmail(to: string, override?: Partial<SmtpConfig>): Promise<void> {
    const settings = await this.settingsService.get();
    const smtp: SmtpConfig = { ...settings.smtp_config, ...(override || {}) };

    if (!smtp.host) throw new ValidationError('SMTP host is not configured');
    if (!smtp.fromEmail && !smtp.user) {
      throw new ValidationError('SMTP from-address is not configured');
    }

    const shop = await this.shopSettingsService.get();
    const vars = buildVars({
      payment: null,
      product: null,
      shop: {
        name: shop.name,
        ip: shop.ip,
        shopUrl: shop.shopUrl,
        contactEmail: shop.contactEmail,
      },
      isPreview: true,
    });

    const subject = `[ТЕСТ] ${renderTemplate(settings.receipt_template.subject, vars)}`;
    const html = renderTemplate(settings.receipt_template.html, varsForHtml(vars));

    await this.sendRendered(to, subject, html, smtp);
  }

  async renderPreview(template: ReceiptTemplate): Promise<{ subject: string; html: string }> {
    const shop = await this.shopSettingsService.get();
    const vars = buildVars({
      payment: null,
      product: null,
      shop: {
        name: shop.name,
        ip: shop.ip,
        shopUrl: shop.shopUrl,
        contactEmail: shop.contactEmail,
      },
      isPreview: true,
    });
    return {
      subject: renderTemplate(template.subject, vars),
      html: renderTemplate(template.html, varsForHtml(vars)),
    };
  }
}

function varsForHtml(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    out[key] = escapeHtml(value);
  }
  return out;
}
