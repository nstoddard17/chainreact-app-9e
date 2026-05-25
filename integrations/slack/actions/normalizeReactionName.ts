/**
 * Safe-and-narrow normalizer for Slack reaction emoji names.
 *
 * Slack's `reactions.add` / `reactions.remove` accept the bare emoji
 * name (`thumbsup`, `tada`, `eyes`) without surrounding colons. Users
 * and workflow templates frequently write `:thumbsup:` because that's
 * how Slack renders emoji in messages — we strip the colons so both
 * forms work.
 *
 * Per Slack 2.1 plan + Marcus's Commit 6 guidance: "do not auto-
 * normalize emoji names too aggressively." That means:
 *   - Strip ONE leading colon and ONE trailing colon if both are present.
 *   - Trim ASCII whitespace.
 *   - Do NOT lowercase (Slack accepts both `+1` and `+1`; case is
 *     emoji-name-specific).
 *   - Do NOT translate aliases (`+1` is the official name; we don't
 *     map `thumbsup` to `+1` or vice versa).
 *   - Do NOT strip skin-tone modifiers (`thumbsup::skin-tone-2` is a
 *     valid Slack reaction name and must round-trip unchanged after
 *     colon-stripping).
 *
 * For the skin-tone case: input `:thumbsup::skin-tone-2:` → strip
 * outer colons only → `thumbsup::skin-tone-2`. The internal `::`
 * stays — Slack's format uses doubled colons to separate emoji from
 * tone modifier and we must not touch that.
 */
export function normalizeReactionName(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  // Only strip BOTH outer colons together — never just leading or just
  // trailing. Avoids surprising behavior on malformed input like
  // `:thumbsup`.
  if (
    trimmed.length >= 2 &&
    trimmed.startsWith(":") &&
    trimmed.endsWith(":")
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
