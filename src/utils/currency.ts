import { CurrencyRates } from '@/models/shop-settings.model';

/**
 * RUB is the platform's anchor currency. Every rate is "how many RUB in 1 X",
 * and conversions go through RUB rather than maintaining a full N×N matrix.
 * Keeping a single base means there's exactly one number to edit per
 * currency in the admin panel.
 */
export const BASE_CURRENCY = 'RUB';

/**
 * Convert `amount` from `currency` into RUB using the supplied rate map.
 * Unknown currencies fall through unchanged (treated as 1:1) — better than
 * silently dropping the amount, and visible in the UI for the admin to fix.
 */
export function toBaseCurrency(amount: number, currency: string, rates: CurrencyRates): number {
  if (currency === BASE_CURRENCY) return amount;
  const rate = rates?.[currency];
  if (!rate || rate <= 0 || !Number.isFinite(rate)) return amount;
  return amount * rate;
}

/**
 * Convert `amount` from `fromCurrency` into `toCurrency`. Goes through RUB
 * as an intermediate, so editing a single rate in admin is enough to keep
 * every cross-currency calculation consistent.
 */
export function convert(amount: number, fromCurrency: string, toCurrency: string, rates: CurrencyRates): number {
  if (fromCurrency === toCurrency) return amount;
  const rub = toBaseCurrency(amount, fromCurrency, rates);
  if (toCurrency === BASE_CURRENCY) return rub;
  const rate = rates?.[toCurrency];
  if (!rate || rate <= 0 || !Number.isFinite(rate)) return rub;
  return rub / rate;
}

/**
 * Build a SQL `CASE` expression that converts a `total_amount` column into
 * RUB inline, so a row can be ORDER'd by its base-currency value without
 * a post-query sort. Rates are inlined as numeric literals — they're the
 * admin's own data, not user input, but we still coerce via `Number()` so
 * a corrupted JSONB value can't slip a string into the SQL.
 *
 * Example output (with `{ USD: 95, EUR: 100 }`):
 *   `CASE currency WHEN 'USD' THEN total_amount * 95 WHEN 'EUR' THEN total_amount * 100 ELSE total_amount END`
 */
export function buildAmountInBaseSql(
  rates: CurrencyRates,
  amountColumn = 'total_amount',
  currencyColumn = 'currency',
): string {
  const branches: string[] = [];
  for (const [code, rate] of Object.entries(rates ?? {})) {
    const numeric = Number(rate);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    if (code === BASE_CURRENCY) continue;
    // `code` is whitelisted to alphanumerics to keep SQL injection-proof
    // even though it comes from a JSONB key the admin controls.
    if (!/^[A-Z0-9]{1,8}$/i.test(code)) continue;
    branches.push(`WHEN '${code}' THEN ${amountColumn} * ${numeric}`);
  }
  if (branches.length === 0) return amountColumn;
  return `CASE ${currencyColumn} ${branches.join(' ')} ELSE ${amountColumn} END`;
}
