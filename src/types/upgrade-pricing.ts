export type UpgradeBlockReason = 'already_owned_or_cheaper';

export interface UpgradeEvaluation {
  upgradeDiscount: number;
  unitPrice: number;
  finalUnitPrice: number;
  currency: string;
  blocked: boolean;
  blockedReason?: UpgradeBlockReason;
  reference?: {
    productId: string;
    productName: string;
    referencePrice: number;
  };
}
