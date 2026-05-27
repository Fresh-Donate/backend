export const COIN_DENOMINATIONS = [1000, 100, 10, 1, 0.1, 0.01] as const;

export type CoinDenominationKey =
  | '1000'
  | '100'
  | '10'
  | '1'
  | '0.1'
  | '0.01';

export type CoinPackagesMap = Record<CoinDenominationKey, string>;

export interface CoinPlanItem {
  packageId: string;
  quantity: number;
  denomination: number;
}

export function decomposeAmount(
  amount: number,
  coinPackages: CoinPackagesMap,
): CoinPlanItem[] {
  if (!Number.isFinite(amount) || amount <= 0) return [];

  let cents = Math.round(amount * 100);
  const plan: CoinPlanItem[] = [];

  for (const denomination of COIN_DENOMINATIONS) {
    if (cents <= 0) break;
    const denomCents = Math.round(denomination * 100);
    if (denomCents <= 0) continue;

    const packageId = coinPackages[String(denomination) as CoinDenominationKey];
    if (!packageId) continue;

    const qty = Math.floor(cents / denomCents);
    if (qty === 0) continue;

    plan.push({ packageId, quantity: qty, denomination });
    cents -= qty * denomCents;
  }

  return plan;
}

export function missingCoinDenominations(coinPackages: Partial<CoinPackagesMap> | undefined): string[] {
  const missing: string[] = [];
  for (const denomination of COIN_DENOMINATIONS) {
    const key = String(denomination) as CoinDenominationKey;
    if (!coinPackages?.[key]) missing.push(key);
  }
  return missing;
}
