import { CronExpressionParser } from "cron-parser";

/**
 * Cron-expression facade — Native-nodes Slice 2 Commit 2.
 *
 * Per docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §5.5
 * (NPD-N11 accepted: add `cron-parser` runtime dep).
 *
 * Single-file facade around `cron-parser` so the dep choice stays
 * reversible. Anything outside this module imports the two exports
 * below; nothing else touches `cron-parser` directly.
 *
 * Scope contracts:
 *   - **5-field UTC only** (NPD-N12). The validator rejects presets
 *     (`@hourly`, `@daily`, …), 6-field (second-precision), and
 *     anything that doesn't tokenize cleanly into 5 whitespace-
 *     separated fields. cron-parser by default accepts presets;
 *     pre-tokenization here gives us the narrower contract.
 *   - **UTC interpretation**. We pass `tz: "UTC"` so DST has no
 *     effect on the next-fire calculation. Workflow authors who
 *     want local-time scheduling encode their UTC offset manually
 *     (e.g. `"0 13 * * 1-5"` for 9am EST). Per-trigger timezone is
 *     deferred per NPD-N12.
 *   - **No throws from the facade.** `isValidCronExpression` returns
 *     a boolean; `computeNextFireTime` returns `null` for invalid
 *     input. Schema validators wrap the boolean via Zod refine.
 */

const EXPECTED_FIELD_COUNT = 5;
const PRESET_REJECT_PREFIX = "@";

/**
 * Returns true iff `expr` is a valid 5-field UTC cron expression.
 *
 * Rejects:
 *   - Empty / whitespace-only strings.
 *   - Presets (`@hourly`, `@daily`, `@yearly`, …).
 *   - 6-field expressions (second-precision).
 *   - Any expression cron-parser refuses to parse.
 */
export function isValidCronExpression(expr: string): boolean {
  if (typeof expr !== "string") return false;
  const trimmed = expr.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith(PRESET_REJECT_PREFIX)) return false;

  const fields = trimmed.split(/\s+/);
  if (fields.length !== EXPECTED_FIELD_COUNT) return false;

  try {
    CronExpressionParser.parse(trimmed, { tz: "UTC" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes the next fire time strictly after `now` for `expr`.
 *
 * - Returns a `Date` representing the next scheduled fire (UTC instant).
 * - Returns `null` if the expression fails {@link isValidCronExpression}
 *   OR if cron-parser cannot produce a next fire.
 * - `now` accepts `Date | number` (epoch ms). Defaults to `new Date()`.
 *
 * Determinism: the returned Date is the FIRST scheduled fire strictly
 * greater than `now`. Cron-parser's iterator is initialized with
 * `currentDate = now`; calling `.next()` returns the first fire
 * after that point.
 */
export function computeNextFireTime(
  expr: string,
  now: Date | number = new Date(),
): Date | null {
  if (!isValidCronExpression(expr)) return null;

  const currentDate = typeof now === "number" ? new Date(now) : now;
  try {
    const iterator = CronExpressionParser.parse(expr.trim(), {
      currentDate,
      tz: "UTC",
    });
    const next = iterator.next();
    return next.toDate();
  } catch {
    return null;
  }
}
