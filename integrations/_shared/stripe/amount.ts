/**
 * Stripe amount helpers.
 *
 * Stripe's REST API expects amounts in the smallest currency unit
 * (cents for USD, pence for GBP, yen for JPY zero-decimal currencies,
 * etc.). User-facing workflow inputs are typically in dollars
 * (e.g. "20.99"). The two formats need explicit, tested conversion.
 *
 * V1 port — `Math.round(parseFloat(amount) * 100)`. The rounding step
 * matters for fractional cents:
 *   - `0.1 + 0.2 === 0.30000000000000004` would otherwise become
 *     `30.00000000000001` cents and `parseInt` would truncate to 30
 *     correctly, but `Math.round` survives any floating-point imprecision.
 *   - `parseFloat("20.99") * 100 === 2098.9999999999995`
 *     `Math.round(...)` → `2099`. `parseInt(2098.9999...)` → `2098`. The
 *     rounding form is the right one.
 *
 * Slice 11 amount-handling asymmetry (V1 quirk preserved):
 *   - `create_payment_intent` / `create_refund` — `amount` is in
 *     dollars (user-facing); handlers call `dollarsToCents`.
 *   - `capture_payment_intent` — `amount_to_capture` is in CENTS
 *     directly (V1's wire-format passthrough). Handler schemas
 *     document this loudly so workflow authors who pass dollars
 *     fail loud rather than silently capturing 1% of the intended
 *     amount.
 *
 * Future V2 may normalize all amounts to cents at the schema layer,
 * but Slice 11 mirrors V1 to keep the port mechanical.
 */

/**
 * Convert a dollar amount (user-facing) to cents (Stripe wire-format).
 *
 * Throws on:
 *   - Non-finite input (NaN, Infinity).
 *   - Negative input (Stripe rejects negative amounts; failing here
 *     gives a typed handler-side error rather than a Stripe 400).
 *
 * Accepts `string` or `number` — workflow variable resolution often
 * yields strings even for declared-number fields. `parseFloat`
 * tolerates leading whitespace / trailing non-numeric chars; the
 * `isFinite` guard catches `parseFloat("not-a-number") === NaN`.
 */
export function dollarsToCents(amount: number | string): number {
  const parsed = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `dollarsToCents: amount '${String(amount)}' is not a finite number.`,
    );
  }
  if (parsed < 0) {
    throw new Error(
      `dollarsToCents: amount '${String(amount)}' is negative; Stripe rejects negative amounts.`,
    );
  }
  return Math.round(parsed * 100);
}
