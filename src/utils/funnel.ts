import type { PaymentStatus } from '@/models/payment.model';
import type { FunnelProvider, StatsFunnel } from '@/types';

export const ATTEMPT_GAP_MS = 30 * 60 * 1000;
export const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface FunnelOrder {
  nickname: string;
  providerId: string | null;
  status: PaymentStatus;
  createdAt: Date;
  paidAt: Date | null;
  deliveredAt: Date | null;
}

type Outcome = 'paid' | 'awaitingPayment' | 'returnedLater' | 'leftAfterDecline' | 'left';
type DeliveryState = 'delivered' | 'awaitingDelivery' | 'deliveryFailed' | 'refundedBeforeDelivery';

interface Attempt {
  orders: FunnelOrder[];
  startedAt: number;
  endedAt: number;
  paidOrder: FunnelOrder | null;
}

export function buildFunnel(orders: FunnelOrder[], to: Date): Omit<StatsFunnel, 'declineReasons'> {
  const byNickname = new Map<string, FunnelOrder[]>();
  for (const order of orders) {
    const key = order.nickname.toLowerCase();
    const list = byNickname.get(key);
    if (list) list.push(order);
    else byNickname.set(key, [order]);
  }

  const counted: { attempt: Attempt; outcome: Outcome }[] = [];
  for (const list of byNickname.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const attempts = splitAttempts(list);
    attempts.forEach((attempt, i) => {
      if (attempt.startedAt > to.getTime()) return;
      counted.push({ attempt, outcome: outcomeOf(attempt, attempts.slice(i + 1)) });
    });
  }

  const outcomes: Record<Outcome, number> = {
    paid: 0, awaitingPayment: 0, returnedLater: 0, leftAfterDecline: 0, left: 0,
  };
  const delivery: Record<DeliveryState, number> = {
    delivered: 0, awaitingDelivery: 0, deliveryFailed: 0, refundedBeforeDelivery: 0,
  };
  const providers = new Map<string | null, FunnelProvider>();
  const toPay: number[] = [];
  const toDeliver: number[] = [];
  let orderCount = 0;
  let paidFirstTry = 0;
  let refunded = 0;

  for (const { attempt, outcome } of counted) {
    orderCount += attempt.orders.length;
    outcomes[outcome]++;

    const paidOrder = attempt.paidOrder;
    if (paidOrder?.paidAt) {
      if (attempt.orders.length === 1) paidFirstTry++;
      if (paidOrder.status === 'refunded') refunded++;
      delivery[deliveryStateOf(paidOrder)]++;
      toPay.push(Math.max(0, paidOrder.paidAt.getTime() - attempt.startedAt) / 1000);
      if (paidOrder.deliveredAt) {
        toDeliver.push(Math.max(0, paidOrder.deliveredAt.getTime() - paidOrder.paidAt.getTime()) / 1000);
      }
    }

    for (const providerId of new Set(attempt.orders.map((o) => o.providerId))) {
      let row = providers.get(providerId);
      if (!row) {
        row = { providerId, attempts: 0, paid: 0, switched: 0, lost: 0 };
        providers.set(providerId, row);
      }
      row.attempts++;
      if (paidOrder) {
        if (paidOrder.providerId === providerId) row.paid++;
        else row.switched++;
      } else if (outcome === 'left' || outcome === 'leftAfterDecline') {
        row.lost++;
      }
    }
  }

  return {
    orders: orderCount,
    attempts: counted.length,
    paid: outcomes.paid,
    paidFirstTry,
    awaitingPayment: outcomes.awaitingPayment,
    returnedLater: outcomes.returnedLater,
    leftAfterDecline: outcomes.leftAfterDecline,
    left: outcomes.left,
    ...delivery,
    refunded,
    providers: [...providers.values()].sort((a, b) => b.attempts - a.attempts),
    medianSecondsToPay: median(toPay),
    medianSecondsToDeliver: median(toDeliver),
  };
}

function splitAttempts(orders: FunnelOrder[]): Attempt[] {
  const attempts: Attempt[] = [];
  let current: FunnelOrder[] = [];
  for (const order of orders) {
    const prev = current[current.length - 1];
    if (prev && (prev.paidAt || order.createdAt.getTime() - prev.createdAt.getTime() > ATTEMPT_GAP_MS)) {
      attempts.push(toAttempt(current));
      current = [];
    }
    current.push(order);
  }
  if (current.length > 0) attempts.push(toAttempt(current));
  return attempts;
}

function toAttempt(orders: FunnelOrder[]): Attempt {
  const first = orders[0];
  const last = orders[orders.length - 1];
  return {
    orders,
    startedAt: first.createdAt.getTime(),
    endedAt: last.createdAt.getTime(),
    paidOrder: last.paidAt ? last : null,
  };
}

function outcomeOf(attempt: Attempt, later: Attempt[]): Outcome {
  if (attempt.paidOrder) return 'paid';
  if (attempt.orders.some((o) => o.status === 'pending')) return 'awaitingPayment';
  const deadline = attempt.endedAt + RETURN_WINDOW_MS;
  if (later.some((a) => a.paidOrder && a.startedAt <= deadline)) return 'returnedLater';
  if (attempt.orders.some((o) => o.status === 'failed')) return 'leftAfterDecline';
  return 'left';
}

function deliveryStateOf(order: FunnelOrder): DeliveryState {
  if (order.status === 'delivered') return 'delivered';
  if (order.status === 'refunded') return order.deliveredAt ? 'delivered' : 'refundedBeforeDelivery';
  if (order.status === 'failed') return 'deliveryFailed';
  return 'awaitingDelivery';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(value);
}
