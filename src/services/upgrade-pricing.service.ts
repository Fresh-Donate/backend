import { Op } from 'sequelize';
import { Product } from '@/models/product.model';
import { Group } from '@/models/group.model';
import { Payment } from '@/models/payment.model';
import { Customer } from '@/models/customer.model';
import { Promotion } from '@/models/promotion.model';
import { SettingsService } from './settings.service';
import { activePromotionsAt, applyDiscount, totalDiscountPercent } from './promotion.service';
import { convert } from '@/utils/currency';

export type UpgradeBlockReason = 'already_owned_or_cheaper';

export interface UpgradeEvaluation {
  /** Discount in `currency` to subtract from this product's already-promo'd unit price. */
  upgradeDiscount: number;
  /** Promo-aware unit price BEFORE upgrade discount, in `currency`. */
  unitPrice: number;
  /** Final per-unit price after upgrade discount; never negative. */
  finalUnitPrice: number;
  /** Currency of all the numbers above (always equals the target product's currency). */
  currency: string;
  /** Set when the buyer has already paid for an equally- or higher-priced product in any of this product's upgrade groups. */
  blocked: boolean;
  blockedReason?: UpgradeBlockReason;
  /** Hints for the UI — id + name of the prior in-group product that drove the discount/block, if any. */
  reference?: {
    productId: string;
    productName: string;
    referencePrice: number;
  };
}

/**
 * Compute "доплата" pricing for `(nickname, productId)`. The rule is:
 *
 *  - For every group containing this product where `upgradeMode = true`,
 *    find the customer's most recent successful purchase of any *other*
 *    in-group product. (Buying the same product again counts too — it
 *    just trips the `blocked` branch since the new price ≤ its own price.)
 *  - That product's *current* promo-aware price (converted into the target
 *    currency if needed) is the "reference price" for that group.
 *  - If `currentTargetPrice <= referencePrice` → blocked.
 *  - Otherwise the group offers `discount = referencePrice`. Across multiple
 *    upgrade groups, the highest discount wins, but a block in *any* group
 *    blocks overall — having any same-or-higher rank precludes the buy.
 *
 * Currency conversion goes through the admin's `currency_rates` so a prior
 * USD purchase still drives a discount on a RUB product, etc.
 */
export class UpgradePricingService {
  private settingsService = new SettingsService();

  async evaluate(nickname: string, productId: string): Promise<UpgradeEvaluation> {
    const product = await Product.findByPk(productId, {
      include: [
        { model: Group, through: { attributes: [] as string[] }, required: false },
        { model: Promotion, through: { attributes: [] as string[] }, required: false },
      ],
    });
    if (!product) {
      // Caller is responsible for the "product missing" error; here we just
      // produce a no-op evaluation so the preview endpoint can still respond
      // sanely without throwing.
      return {
        upgradeDiscount: 0,
        unitPrice: 0,
        finalUnitPrice: 0,
        currency: 'RUB',
        blocked: false,
      };
    }

    const basePrice = Number(product.price);
    const promoPercent = totalDiscountPercent(activePromotionsAt(product.promotions));
    const unitPrice = applyDiscount(basePrice, promoPercent);
    const currency = product.currency;

    const upgradeGroups = (product.groups || []).filter((g) => g.upgradeMode);
    if (upgradeGroups.length === 0 || !nickname.trim()) {
      return {
        upgradeDiscount: 0,
        unitPrice,
        finalUnitPrice: unitPrice,
        currency,
        blocked: false,
      };
    }

    const settings = await this.settingsService.get();

    let bestDiscount = 0;
    let blocked = false;
    let reference: UpgradeEvaluation['reference'];

    for (const group of upgradeGroups) {
      const groupProductIds = await this.productIdsInGroup(group.id);
      if (groupProductIds.length === 0) continue;

      // Latest successful in-group purchase by this nickname. We DON'T
      // exclude the target product itself — buying the same rank again
      // should still be caught by the "<=" branch and blocked, which is
      // the cleaner failure mode than "discount = full price → free".
      const lastPayment = await Payment.findOne({
        where: {
          status: { [Op.in]: ['paid', 'delivered'] },
          productId: { [Op.in]: groupProductIds },
        },
        include: [{ model: Customer, where: { nickname }, required: true }],
        order: [['created_at', 'DESC']],
      });
      if (!lastPayment) continue;

      // Prior product may have been deleted between purchase and now — fall
      // through silently rather than block on stale data.
      const prior = await Product.findByPk(lastPayment.productId, {
        include: [{ model: Promotion, through: { attributes: [] as string[] }, required: false }],
      });
      if (!prior) continue;

      const priorBase = Number(prior.price);
      const priorPercent = totalDiscountPercent(activePromotionsAt(prior.promotions));
      const priorCurrentPrice = applyDiscount(priorBase, priorPercent);

      // Drag everything into the target's currency before comparing — a
      // 100 USD prior is worth ~9500 RUB on a RUB product.
      const referenceInTarget = convert(
        priorCurrentPrice,
        prior.currency,
        currency,
        settings.currency_rates,
        settings.base_currency,
      );
      const refRounded = Math.round(referenceInTarget * 100) / 100;

      if (unitPrice <= refRounded) {
        blocked = true;
        if (!reference || refRounded > reference.referencePrice) {
          reference = { productId: prior.id, productName: prior.name, referencePrice: refRounded };
        }
        // Don't break — keep scanning so `reference` ends up pointing at
        // the most expensive blocking rank if there are several.
        continue;
      }

      if (refRounded > bestDiscount) {
        bestDiscount = refRounded;
        reference = { productId: prior.id, productName: prior.name, referencePrice: refRounded };
      }
    }

    if (blocked) {
      return {
        upgradeDiscount: 0,
        unitPrice,
        finalUnitPrice: unitPrice,
        currency,
        blocked: true,
        blockedReason: 'already_owned_or_cheaper',
        reference,
      };
    }

    const finalUnitPrice = Math.max(0, Math.round((unitPrice - bestDiscount) * 100) / 100);
    return {
      upgradeDiscount: bestDiscount,
      unitPrice,
      finalUnitPrice,
      currency,
      blocked: false,
      reference: bestDiscount > 0 ? reference : undefined,
    };
  }

  private async productIdsInGroup(groupId: string): Promise<string[]> {
    const group = await Group.findByPk(groupId, {
      include: [{ model: Product, attributes: ['id'], through: { attributes: [] as string[] } }],
    });
    return (group?.products || []).map((p) => p.id);
  }
}
