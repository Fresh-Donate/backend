import { Op } from 'sequelize';
import { Payment } from '@/models/payment.model';

// 30 min covers slow real-world checkouts (user opens provider page, then
// goes to grab their card) without letting abandoned carts pile up. Late
// `paid` webhooks past TTL are still honoured — see handle*Webhook branches
// in payment.service that accept both `pending` and `expired`.
export const PAYMENT_TTL_MS = 30 * 60 * 1000;

export class PaymentExpirationService {
  async expireStalePayments(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - PAYMENT_TTL_MS);
    const [affected] = await Payment.update(
      { status: 'expired' },
      {
        where: {
          status: 'pending',
          createdAt: { [Op.lt]: cutoff },
        },
      },
    );
    return affected;
  }

  // Lazy-check on read paths so user-visible status flips immediately
  // without waiting for the next sweeper pass.
  isStale(payment: { status: string; createdAt: Date }, now: Date = new Date()): boolean {
    return payment.status === 'pending' && now.getTime() - payment.createdAt.getTime() >= PAYMENT_TTL_MS;
  }
}
