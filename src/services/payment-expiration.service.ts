import { Op } from 'sequelize';
import { Payment } from '@/models/payment.model';

/**
 * How long a `pending` payment is allowed to live before being auto-marked
 * as `expired`. Tuned to cover slow real-world checkouts (user opens the
 * provider page, then leaves to grab their card) without letting abandoned
 * carts pile up forever in the admin dashboard.
 *
 * Webhooks from `paid → expired` are still honoured (see `handle*Webhook`
 * branches in payment.service), so this is a UI-side cleanup, not a hard
 * cutoff for the user.
 */
export const PAYMENT_TTL_MS = 30 * 60 * 1000;

export class PaymentExpirationService {
  /**
   * Bulk-mark stale `pending` payments as `expired`. Idempotent — only
   * rows still in `pending` and older than {@link PAYMENT_TTL_MS} are
   * touched. Returns the number of rows transitioned.
   *
   * Called by the background sweeper plugin every few minutes; also safe
   * to invoke ad hoc.
   */
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

  /**
   * Lazy-check helper: true if a payment is still `pending` but has aged
   * past the TTL. Used on read paths so the user-visible status is correct
   * immediately, without waiting for the next sweeper pass.
   */
  isStale(payment: { status: string; createdAt: Date }, now: Date = new Date()): boolean {
    return payment.status === 'pending' && now.getTime() - payment.createdAt.getTime() >= PAYMENT_TTL_MS;
  }
}
