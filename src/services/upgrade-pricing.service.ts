import { Op } from 'sequelize';
import { Product } from '@/models/product.model';
import { Group } from '@/models/group.model';
import { Payment } from '@/models/payment.model';
import { PaymentItem } from '@/models/payment-item.model';
import { Promotion } from '@/models/promotion.model';
import { SettingsService } from './settings.service';
import { activePromotionsAt, applyDiscount, totalDiscountPercent } from './promotion.service';
import { convert } from '@/utils/currency';
import type { UpgradeEvaluation } from '@/types';

// "Доплата" pricing for (nickname, productId):
//   - For each upgradeMode group containing this product, find the buyer's
//     most recent successful purchase of any other in-group product.
//   - Use that prior product's *current* promo-aware price as the reference
//     (converted into the target currency via admin currency_rates).
//   - If currentTargetPrice <= referencePrice → blocked (same rank or lower,
//     nothing to upgrade).
//   - Otherwise discount = referencePrice. Across multiple upgrade groups,
//     highest discount wins, but a block in any group blocks overall.
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

      // Look across line items (not just payments.product_id) so an in-group
      // product bought as a non-first item of a past cart still counts as a
      // prior purchase to upgrade from.
      const lastItem = await PaymentItem.findOne({
        where: { productId: { [Op.in]: groupProductIds } },
        include: [{
          model: Payment,
          required: true,
          where: {
            status: { [Op.in]: ['paid', 'delivered'] },
            customerNickname: nickname,
          },
        }],
        order: [['created_at', 'DESC']],
      });
      if (!lastItem) continue;

      const prior = await Product.findByPk(lastItem.productId, {
        include: [{ model: Promotion, through: { attributes: [] as string[] }, required: false }],
      });
      if (!prior) continue;

      const priorBase = Number(prior.price);
      const priorPercent = totalDiscountPercent(activePromotionsAt(prior.promotions));
      const priorCurrentPrice = applyDiscount(priorBase, priorPercent);

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
