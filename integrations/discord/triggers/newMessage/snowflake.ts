/**
 * Discord snowflake helpers — Slice 3.DISCORD-7.
 *
 * Discord ids are 64-bit ints encoded as ASCII decimal strings. The
 * upper 42 bits encode the creation timestamp in milliseconds since
 * the Discord epoch (`2015-01-01T00:00:00Z` = 1420070400000 ms). The
 * lower 22 bits are worker / process / increment counters — opaque to
 * V2.
 *
 * The polling trigger uses two snowflake operations:
 *
 *   - **`snowflakeFromTimestamp(ms)`** — synthesize a "high-water-mark"
 *     snowflake from a Unix-millis timestamp. Used by `activate.ts`
 *     when the channel is empty at activation time: we need ANY value
 *     newer than every existing message so the first real new message
 *     polls in. Using `Date.now() << 22` (with epoch offset) gives a
 *     value that's strictly greater than every historical message id
 *     and strictly less than any message id created after activation.
 *     This is the "first-poll-miss" defense for the empty-channel
 *     case (CLAUDE.md polling-trigger snapshot rule).
 *
 *   - **`maxSnowflake(a, b)`** — pure BigInt-max compare. Used by
 *     `poll.ts` to advance the snapshot to `max(currentSnapshot,
 *     newestSeenMessageId)`. Discord returns the newest-first batch
 *     when called with `after=<cursor>`, but the trigger must never
 *     regress the cursor below the previously-stored value (defensive
 *     against any future Discord ordering quirk).
 *
 * Both functions accept and return decimal-string snowflakes — never
 * convert to JS `number` (snowflakes overflow `Number.MAX_SAFE_INTEGER`
 * after `2024-12-04T07:50:23Z`).
 */

/** Discord epoch — 2015-01-01T00:00:00Z in Unix-millis. */
export const DISCORD_EPOCH_MS = 1420070400000n;

/**
 * Synthesize a snowflake from a Unix-millis timestamp.
 *
 * `((timestampMs - DISCORD_EPOCH_MS) << 22)` matches Discord's own
 * snowflake-construction formula for the empty-counter case. Any
 * message Discord creates AFTER `timestampMs` will have a strictly
 * larger snowflake; any message created BEFORE will have a strictly
 * smaller one.
 *
 * Throws if `timestampMs` is before the Discord epoch — that would
 * produce a negative snowflake which Discord rejects.
 */
export function snowflakeFromTimestamp(timestampMs: number): string {
  const bigMs = BigInt(timestampMs);
  if (bigMs < DISCORD_EPOCH_MS) {
    throw new Error(
      `snowflakeFromTimestamp: timestampMs ${timestampMs} is before the Discord epoch (${DISCORD_EPOCH_MS}).`,
    );
  }
  return (((bigMs - DISCORD_EPOCH_MS) << 22n)).toString();
}

/**
 * Return whichever snowflake is larger by BigInt comparison.
 *
 * `null` / undefined / non-parseable inputs fall back to the other
 * value (so the caller can pass `(currentSnapshot, newestSeen)` even
 * when `newestSeen` is absent because the batch was empty).
 */
export function maxSnowflake(
  a: string | null | undefined,
  b: string | null | undefined,
): string {
  const aBi = safeBigInt(a);
  const bBi = safeBigInt(b);
  if (aBi === null && bBi === null) {
    // Both unparseable — defensive fallback. Return the first
    // truthy value so the caller still has a non-empty string.
    return a ?? b ?? "0";
  }
  if (aBi === null) return b ?? "0";
  if (bBi === null) return a ?? "0";
  return aBi >= bBi ? (a as string) : (b as string);
}

function safeBigInt(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined || value.length === 0) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}
