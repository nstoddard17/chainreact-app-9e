import { CronExpressionParser } from "cron-parser";

/**
 * Client-safe cron-expression humanizer.
 *
 * Slice 3.3 — the builder's CronField renderer needs to surface "is
 * this expression valid?" + "when will it fire?" inline as the author
 * types. The server-side facade at `services/cron/cronExpression.ts`
 * cannot be imported by `features/` (project-structure rule §4 forbids
 * `services/` → client), so this module re-implements the narrow
 * subset features need, against the same `cron-parser` dep.
 *
 * Scope contracts mirror the server facade verbatim so client UI
 * validation and server validation agree:
 *   - **5-field UTC only.** Presets (`@hourly`, …) and 6-field
 *     expressions are rejected even though `cron-parser` accepts
 *     them — the server schema rejects them too.
 *   - **UTC interpretation.** `tz: "UTC"` so the upcoming-fires preview
 *     matches what the server scheduler will actually pick.
 *   - **No throws.** Both functions return null / empty arrays on
 *     invalid input; the renderer renders "Invalid cron expression"
 *     from the falsy return.
 *
 * Per project-structure rule, lives in `core/` (read-only utility)
 * rather than `features/<self>/` so the eventual provider config UIs
 * for cron-based providers (e.g. polling intervals expressed as cron)
 * can reuse the same helper without breaking the import-boundary rule.
 */

const EXPECTED_FIELD_COUNT = 5;
const PRESET_REJECT_PREFIX = "@";

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
 * Compute up to `limit` upcoming fire times (UTC) strictly after `now`.
 *
 * - Returns `null` if {@link isValidCronExpression} rejects the input.
 * - Returns `[]` if the parser fails partway through (very rare; defensive).
 * - `limit` is clamped to [1, 10]. Two is the typical builder preview.
 *
 * Used by `CronField` to render "Runs next at …" hints inline. A full
 * English description ("every weekday at 9am UTC") would need another
 * dep (`cronstrue`) — upcoming-fires is the lowest-risk humanizer that
 * answers "did I write this expression correctly?" for the author.
 */
export function computeUpcomingFireTimes(
  expr: string,
  now: Date | number = new Date(),
  limit = 2,
): readonly Date[] | null {
  if (!isValidCronExpression(expr)) return null;
  const safeLimit = Math.min(10, Math.max(1, Math.floor(limit)));
  const currentDate = typeof now === "number" ? new Date(now) : now;
  try {
    const iterator = CronExpressionParser.parse(expr.trim(), {
      currentDate,
      tz: "UTC",
    });
    const out: Date[] = [];
    for (let i = 0; i < safeLimit; i++) {
      out.push(iterator.next().toDate());
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Format a UTC `Date` as an "easy to scan" preview for builder authors.
 * Uses the runtime's `Intl.DateTimeFormat` with explicit UTC timezone so
 * the rendered string communicates the cron's actual fire instant
 * regardless of the user's local tz.
 *
 * Example: `2026-05-17T09:00:00Z` → `"Sun, May 17, 2026, 09:00 UTC"`.
 */
export function formatUtcFireTime(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${fmt.format(d)} UTC`;
}
