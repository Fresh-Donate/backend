import { literal } from 'sequelize';
import { Payment } from '@/models/payment.model';

function jsonb(value: unknown): string {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

function text(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function mergedMeta(patch: Record<string, unknown>) {
  return literal(`COALESCE("meta", '{}'::jsonb) || ${jsonb(patch)}`);
}

export async function patchPaymentMeta(paymentId: string, patch: Record<string, unknown>): Promise<void> {
  await Payment.update({ meta: mergedMeta(patch) }, { where: { id: paymentId } });
}

export async function removePaymentMetaKey(paymentId: string, key: string): Promise<void> {
  await Payment.update(
    { meta: literal(`COALESCE("meta", '{}'::jsonb) - ${text(key)}`) },
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
