/**
 * Cross-currency math used by the panel-wide settings.
 *
 * The platform supports a tight allow-list of three currencies — RUB, USD,
 * EUR — one of which the admin nominates as the *base*. Rates are stored as
 * "how many units of the base in 1 unit of the given currency", so e.g. with
 * base RUB and `{ USD: 95, EUR: 100 }`, 1 USD = 95 RUB.
 *
 * Keeping the list closed (rather than an open Record) lets `/settings`
 * render a fixed-size form: two input rows, no add/remove. When the admin
 * changes the base, the two non-base rates are regenerated from defaults so
 * stale data can't survive the swap.
 */

export type CurrencyRates = Record<string, number>;

export const SUPPORTED_CURRENCIES = ['RUB', 'USD', 'EUR'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export const DEFAULT_BASE_CURRENCY: SupportedCurrency = 'RUB';

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

/**
 * Sensible starting rates per base — used on first install and whenever the
 * admin switches the base, so the rate map is always populated for the
 * other two currencies. Values are approximate; the admin tunes them after.
 */
const DEFAULTS_BY_BASE: Record<SupportedCurrency, CurrencyRates> = {
  RUB: { USD: 95, EUR: 100 },
  USD: { RUB: 0.0105, EUR: 1.05 },
  EUR: { RUB: 0.01, USD: 0.95 },
};

export function defaultRatesFor(base: SupportedCurrency): CurrencyRates {
  return { ...DEFAULTS_BY_BASE[base] };
}

/**
 * Convert `amount` from `currency` into the base currency using the supplied
 * rate map. Unknown currencies fall through unchanged (treated as 1:1) —
 * better than silently dropping the amount, and visible in the UI for the
 * admin to fix.
 */
export function toBaseCurrency(amount: number, currency: string, rates: CurrencyRates, base: string): number {
  if (currency === base) return amount;
  const rate = rates?.[currency];
  if (!rate || rate <= 0 || !Number.isFinite(rate)) return amount;
  return amount * rate;
}

/**
 * Convert `amount` from `fromCurrency` into `toCurrency` via the base, so
 * editing a single rate keeps every cross-currency calculation consistent.
 */
export function convert(amount: number, fromCurrency: string, toCurrency: string, rates: CurrencyRates, base: string): number {
  if (fromCurrency === toCurrency) return amount;
  const inBase = toBaseCurrency(amount, fromCurrency, rates, base);
  if (toCurrency === base) return inBase;
  const rate = rates?.[toCurrency];
  if (!rate || rate <= 0 || !Number.isFinite(rate)) return inBase;
  return inBase / rate;
}

/**
 * Build a SQL `CASE` expression that converts a `total_amount` column into
 * the base currency inline, so a row can be ORDER'd by its base value
 * without a post-query sort. Rates are inlined as numeric literals — they're
 * the admin's own data, not user input, but we still coerce via `Number()`
 * so a corrupted JSONB value can't slip a string into the SQL.
 *
 * Example output (base=RUB, rates={ USD: 95, EUR: 100 }):
 *   `CASE currency WHEN 'USD' THEN total_amount * 95 WHEN 'EUR' THEN total_amount * 100 ELSE total_amount END`
 */
export function buildAmountInBaseSql(
  rates: CurrencyRates,
  base: string,
  amountColumn = 'total_amount',
  currencyColumn = 'currency',
): string {
  const branches: string[] = [];
  for (const [code, rate] of Object.entries(rates ?? {})) {
    const numeric = Number(rate);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    if (code === base) continue;
    // `code` is whitelisted to alphanumerics to keep SQL injection-proof
    // even though it comes from a JSONB key the admin controls.
    if (!/^[A-Z0-9]{1,8}$/i.test(code)) continue;
    branches.push(`WHEN '${code}' THEN ${amountColumn} * ${numeric}`);
  }
  if (branches.length === 0) return amountColumn;
  return `CASE ${currencyColumn} ${branches.join(' ')} ELSE ${amountColumn} END`;
}
