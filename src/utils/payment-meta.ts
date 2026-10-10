import { literal } from 'sequelize';
import { sequelize } from '@/config/database';
import { Payment } from '@/models/payment.model';

function jsonb(value: unknown): string {
  const json = JSON.stringify(value, (_key, v) => (typeof v === 'string' ? v.replaceAll('\u0000', '') : v));
  return `${sequelize.escape(json)}::jsonb`;
}

export function mergedMeta(patch: Record<string, unknown>) {
  return literal(`COALESCE("meta", '{}'::jsonb) || ${jsonb(patch)}`);
}

export async function patchPaymentMeta(paymentId: string, patch: Record<string, unknown>): Promise<void> {
  await Payment.update({ meta: mergedMeta(patch) }, { where: { id: paymentId } });
}

export async function removePaymentMetaKey(paymentId: string, key: string): Promise<void> {
  await Payment.update(
    { meta: literal(`COALESCE("meta", '{}'::jsonb) - ${sequelize.escape(key)}`) },
    { where: { id: paymentId } },
  );
}

export async function appendDeliveryLog(paymentId: string, log: Record<string, unknown>): Promise<void> {
  await Payment.update(
    {
      meta: literal(
        `jsonb_set(COALESCE("meta", '{}'::jsonb), '{deliveryLogs}', `
        + `COALESCE("meta"->'deliveryLogs', '[]'::jsonb) || ${jsonb([log])})`,
      ),
    },
    { where: { id: paymentId } },
  );
}

export async function archiveDeliveryLogs(paymentId: string): Promise<void> {
  await Payment.update(
    {
      meta: literal(
        `jsonb_set(jsonb_set(COALESCE("meta", '{}'::jsonb), '{previousDeliveryLogs}', `
        + `COALESCE("meta"->'previousDeliveryLogs', '[]'::jsonb) || COALESCE("meta"->'deliveryLogs', '[]'::jsonb)), `
        + `'{deliveryLogs}', '[]'::jsonb)`,
      ),
    },
    { where: { id: paymentId } },
  );
}
