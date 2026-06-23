/**
 * Pure helpers for the temporal field family (CS-1, config-field UX
 * modernization). `date` / `time` / `datetime` renderers share these so the
 * parse / format / normalize rules live in ONE place and are unit-testable
 * without React.
 *
 * Stored-value contract (must match what the handler schemas already accept —
 * see e.g. `integrations/google-calendar/actions/createEvent.schema.ts`):
 *   - date         → "YYYY-MM-DD"            (native <input type="date"> format)
 *   - time         → "HH:MM" or "HH:MM:SS"   (native <input type="time"> format)
 *   - datetime     → "YYYY-MM-DDTHH:MM:SS"   (offset-LESS local wall-clock; the
 *                    provider pairs it with a separate `timezone` field — we never
 *                    attach an offset or convert to UTC, so timezone semantics are
 *                    never silently changed).
 *   - datetime-utc → "YYYY-MM-DDTHH:MM:SSZ"  (a true UTC INSTANT, trailing `Z`).
 *                    For fields whose handler/schema requires an exact instant
 *                    with an offset/`Z` (e.g. list-event query windows, Trello
 *                    due/start, Mailchimp `occurred_at`, Slack `postAt`). The
 *                    user picks a wall-clock and we treat it AS UTC — we DO NOT
 *                    convert from the browser's local zone (that would silently
 *                    shift the instant). The renderer labels this clearly as UTC.
 *
 * A value that does NOT match its kind's pattern (e.g. a `{{variable}}` token,
 * an offset-bearing instant like "...T09:00:00-07:00", a Unix-epoch integer, or
 * garbage) is "incompatible" — the renderer falls back to a raw text input so
 * the value stays visible and editable and is never silently reinterpreted.
 */

export type TemporalKind = "date" | "time" | "datetime" | "datetime-utc";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
// Offset-less local datetime, seconds optional. Anything with a trailing `Z`
// or `±hh:mm` offset deliberately does NOT match (different timezone semantics).
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
// UTC instant: offset-less wall-clock followed by a literal `Z`, seconds
// optional. A `±hh:mm` numeric offset deliberately does NOT match — only the
// `Z` (UTC) form round-trips through this renderer; offset-bearing values fall
// back to text so the user's explicit offset is never rewritten.
const DATETIME_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/;

/** Native `<input type>` for each temporal kind. */
export function nativeInputType(
  kind: TemporalKind,
): "date" | "time" | "datetime-local" {
  return kind === "datetime" || kind === "datetime-utc" ? "datetime-local" : kind;
}

/** True when `value` can be shown in the native control for `kind`. Empty is compatible (the control just renders blank). */
export function isTemporalCompatible(kind: TemporalKind, value: string): boolean {
  if (value === "") return true;
  switch (kind) {
    case "date":
      return DATE_RE.test(value);
    case "time":
      return TIME_RE.test(value);
    case "datetime":
      return DATETIME_RE.test(value);
    case "datetime-utc":
      return DATETIME_UTC_RE.test(value);
  }
}

/**
 * Translate a STORED value into the string the native control should display.
 * Identity for every kind except `datetime-utc`, where the stored value carries
 * a trailing `Z` the `datetime-local` input cannot render — so we strip it for
 * display. The wall-clock shown is exactly the UTC wall-clock (no zone shift).
 * The caller only uses this when `isTemporalCompatible` is true.
 */
export function toControlValue(kind: TemporalKind, stored: string): string {
  if (kind === "datetime-utc" && stored.endsWith("Z")) {
    return stored.slice(0, -1);
  }
  return stored;
}

/**
 * Datetime stored form is "YYYY-MM-DDTHH:MM:SS". Native datetime-local emits
 * minute precision ("YYYY-MM-DDTHH:MM") by default, so append ":00" seconds to
 * match the schema-expected ISO-8601 shape. Already-seconds values pass through.
 * Non-matching input is returned unchanged (the caller gates on compatibility).
 */
export function normalizeDatetimeSeconds(value: string): string {
  // Minute precision (real browsers' default step) → add ":00" seconds.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  // Drop fractional seconds (jsdom and some browsers emit "…:SS.000") so the
  // stored value stays canonical second precision.
  const frac = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+$/);
  if (frac) return frac[1]!;
  return value;
}

/**
 * Translate a native-control change into the value to STORE.
 *   - "" (cleared) → undefined, so optional fields clear cleanly.
 *   - datetime → seconds-normalized string.
 *   - datetime-utc → seconds-normalized string with a trailing `Z` appended
 *     (the picked wall-clock is treated AS UTC — no zone conversion).
 *   - date / time → the control value verbatim (already schema-shaped).
 */
export function fromControlValue(kind: TemporalKind, raw: string): string | undefined {
  if (raw === "") return undefined;
  if (kind === "datetime") return normalizeDatetimeSeconds(raw);
  if (kind === "datetime-utc") return `${normalizeDatetimeSeconds(raw)}Z`;
  return raw;
}

// ─── Timezone helper (for the `timezone` field type) ─────────────────────────

/**
 * Safe fallback IANA list used only when the runtime lacks
 * `Intl.supportedValuesOf` (older engines). A small, common, deliberately
 * non-exhaustive set — enough to keep the picker usable; modern browsers/Node
 * return the full ~400-zone list instead.
 */
const FALLBACK_TIMEZONES: readonly string[] = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/**
 * Sorted list of selectable IANA time zones. Prefers the browser/runtime
 * `Intl.supportedValuesOf("timeZone")` (full canonical list); falls back to a
 * small curated set when unavailable. `UTC` is always present. Defensive about
 * the typing so it compiles regardless of the tsconfig `lib` setting.
 */
export function listTimezones(): string[] {
  const intl = Intl as { supportedValuesOf?: (key: string) => string[] };
  let zones: readonly string[];
  try {
    zones =
      typeof intl.supportedValuesOf === "function"
        ? intl.supportedValuesOf("timeZone")
        : FALLBACK_TIMEZONES;
  } catch {
    zones = FALLBACK_TIMEZONES;
  }
  const set = new Set<string>(zones);
  set.add("UTC");
  return [...set].sort();
}
