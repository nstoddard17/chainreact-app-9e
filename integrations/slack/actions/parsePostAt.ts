/**
 * Strict parser for Slack `chat.scheduleMessage` `post_at` input.
 *
 * Per docs/slices/slack-2-1-messaging-reactions-plan.md §7 Q11
 * ("no hidden high-risk defaults"): scheduling is time-sensitive.
 * Naive datetime strings (no timezone) would silently default to UTC
 * or local time depending on the JavaScript engine — the operator
 * may have meant either, and we don't get to guess. Reject loudly.
 *
 * Accepts:
 *   - Pure integer string of Unix seconds: "1730000000"
 *   - ISO-8601 with explicit `Z` suffix:    "2026-05-20T15:30:00Z"
 *   - ISO-8601 with explicit `+HH:MM` /
 *     `-HH:MM` offset:                      "2026-05-20T15:30:00+05:30"
 *
 * Rejects (intentionally):
 *   - Naive ISO-8601 without timezone: "2026-05-20T15:30:00"
 *   - Date-only strings: "2026-05-20"
 *   - Freeform: "tomorrow at 3pm"
 *   - Empty / whitespace
 *   - Zero or negative Unix seconds (Slack rejects past times anyway,
 *     but we surface a clearer error)
 *   - Slack `ts` format ("1730000000.000123") — that's a message id,
 *     not a `post_at`. The dot makes it fail the integer-string regex
 *     and the lack of T/timezone makes it fail the ISO regex.
 *
 * V1 deliberately NOT ported:
 *   - V1's `scheduleType: "delay"` mode used `Date.now() + delayMs`
 *     server-side. That's an implicit "now plus N" silent default —
 *     exactly the Q11 anti-pattern. V2 requires the caller to compute
 *     the absolute post_at upstream if a delay is desired.
 */

const INTEGER_SECONDS = /^\d+$/;

// ISO-8601 with explicit timezone — requires either `Z` or `[+-]HH:MM`
// at the end, preceded by a time component (`Thh:mm` minimum). This is
// stricter than `Date.parse` would be on its own.
const ISO_WITH_TIMEZONE = /T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

export function parsePostAt(input: string): number {
  if (INTEGER_SECONDS.test(input)) {
    const n = Number(input);
    if (n <= 0) {
      throw new Error(
        "postAt must be a positive Unix-second timestamp (got 0 or negative).",
      );
    }
    return n;
  }

  if (!ISO_WITH_TIMEZONE.test(input)) {
    throw new Error(
      "postAt must be either Unix seconds (positive integer) or ISO-8601 " +
        "with explicit timezone (Z or +HH:MM). Naive datetimes without " +
        "timezone are not accepted — they would silently default to UTC " +
        "or local time. Compute the absolute Unix timestamp upstream.",
    );
  }

  const ms = Date.parse(input);
  if (Number.isNaN(ms)) {
    throw new Error(`postAt could not be parsed as ISO-8601: ${input}`);
  }
  return Math.floor(ms / 1000);
}
