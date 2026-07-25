/**
 * Canonical decimal-safe money helpers for analytics (CD-4B).
 *
 * WHY: providers report money two different ways — Stripe sends INTEGER MINOR
 * units (`amount: 36207`), QuickBooks sends MAJOR-unit decimals
 * (`TotalAmt: 362.07`). Summing major-unit decimals in binary floating point
 * drifts (0.1 + 0.2 !== 0.3), and the drift is unbounded over a 2,000-record
 * scan. Every analytics money path therefore accumulates in INTEGER MINOR
 * UNITS and converts back exactly once, at emit.
 *
 * The currency-decimals table is the single source of truth for how many minor
 * units a currency has; `services/analytics/sources/stripe/buckets.ts` re-uses
 * it rather than keeping a second copy.
 *
 * No currency CONVERSION happens anywhere here — a mixed-currency total is a
 * typed error at the aggregation layer, never an implicit FX rate.
 */

/**
 * Zero-decimal currencies — the major unit has no subdivision.
 * https://stripe.com/docs/currencies#zero-decimal
 */
const ZERO_DECIMAL: ReadonlySet<string> = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/**
 * Three-decimal currencies — the minor unit is 1/1000 of the major unit.
 * https://stripe.com/docs/currencies#three-decimal
 */
const THREE_DECIMAL: ReadonlySet<string> = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

/**
 * Round half-up, absorbing binary representation error first.
 *
 * `1.005 * 100` is 100.49999999999999 in IEEE-754 and `75.005 * 100` is
 * 7500.500000000001, so a bare `Math.round` rounds two equivalent half-cent
 * amounts in OPPOSITE directions. Snapping to 6 decimals before rounding makes
 * the boundary deterministic — a half unit always rounds up — which is what
 * anyone reading an invoice total expects.
 */
function roundHalfUp(scaled: number): number {
  return Math.round(Number(scaled.toFixed(6)));
}

/** Number of minor-unit decimal places for a currency (default 2). */
export function currencyDecimals(currency: string): number {
  const c = currency.toLowerCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

/**
 * Convert a provider's MAJOR-unit decimal (362.07) to an exact integer minor
 * amount (36207) so it can be accumulated without float drift.
 *
 * Returns null for a non-finite input — a malformed provider amount is
 * EXCLUDED from monetary measures, never coerced to 0 (which would silently
 * understate a total).
 */
export function majorUnitsToMinor(value: number, currency: string): number | null {
  if (!Number.isFinite(value)) return null;
  const scaled = value * 10 ** currencyDecimals(currency);
  // Guard the accumulation domain: beyond 2^53 integer arithmetic stops being
  // exact, so an absurd amount is treated as malformed rather than silently
  // rounded into a wrong total.
  if (!Number.isSafeInteger(Math.round(scaled))) return null;
  return roundHalfUp(scaled);
}

/** Convert an integer minor amount back to its major-unit value. */
export function minorUnitsToMajor(amountMinor: number, currency: string): number {
  const decimals = currencyDecimals(currency);
  return decimals === 0 ? amountMinor : amountMinor / 10 ** decimals;
}

/**
 * Round a major-unit amount to the currency's own precision — 2 dp for USD,
 * 0 for JPY, 3 for KWD. Used at emit, after integer accumulation, so an
 * average (the one measure that divides) can't surface a 12-decimal artifact.
 */
export function roundToCurrency(value: number, currency: string): number {
  const factor = 10 ** currencyDecimals(currency);
  return roundHalfUp(value * factor) / factor;
}
