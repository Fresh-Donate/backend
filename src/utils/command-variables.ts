import type { Payment } from '@/models/payment.model';
import type { Product } from '@/models/product.model';
import type { PaymentItem } from '@/models/payment-item.model';

export type CommandVariables = Record<string, string>;

export function buildCommandVariables(
  payment: Payment,
  product: Product,
  item?: PaymentItem,
): CommandVariables {
  const count = item ? item.userSelectedCount : payment.userSelectedCount;
  const units = item ? item.quantity : product.quantity;
  return {
    player: payment.customerNickname || '',
    amount: String(units * count),
    product: item ? item.productName : product.name,
  };
}

export function resolveCommandVariables(command: string, variables: CommandVariables): string {
  let result = command;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}
