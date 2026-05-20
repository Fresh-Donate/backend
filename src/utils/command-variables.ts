import type { Payment } from '@/models/payment.model';
import type { Product } from '@/models/product.model';

export type CommandVariables = Record<string, string>;

export function buildCommandVariables(payment: Payment, product: Product): CommandVariables {
  return {
    player: payment.customer?.nickname || '',
    amount: String(product.quantity * payment.userSelectedCount),
    product: product.name,
  };
}

export function resolveCommandVariables(command: string, variables: CommandVariables): string {
  let result = command;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}
