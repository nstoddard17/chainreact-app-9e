import { z } from "zod";

/**
 * Resolved-config schema for the Outlook Calendar create_event action.
 *
 * Q11 — REQUIRED with no hidden defaults:
 *   - `isAllDay`: V1 silently coerces from various sentinels; V2 forces
 *     explicit choice. Microsoft Graph rejects all-day events whose
 *     start/end aren't midnight in the event timezone — the schema
 *     trusts the caller's choice and lets Graph surface mismatches
 *     with `ErrorInvalidArgument`.
 *   - `responseRequested`: V1's `createCalendarEvent.ts:258` silently
 *     defaults to `true`. V2 forces explicit — it controls whether
 *     attendees see RSVP buttons in the invitation email, which has
 *     user-visible behavior.
 *   - `bodyContentType`: required IF `body` is non-empty (cross-field
 *     refine). V1 silently uses `Text`; V2 forces explicit Text vs HTML.
 *
 * Date/time policy (Q12 + user guidance):
 *   - `start.dateTime` and `end.dateTime` are REQUIRED ISO-8601 strings.
 *     The handler does NOT silently synthesize missing times — Slice 7
 *     plan §"V1 rot fixes" rejects V1's `eventDate: 'today'` /
 *     `eventTime: 'current'` sentinels.
 *   - `start.timeZone` and `end.timeZone` are OPTIONAL — handler
 *     resolves via `core/workflows/datetime.ts:resolveTimezone`
 *     (currently explicit-or-UTC; workspace/user fallback is deferred
 *     per the helper's docstring).
 *
 * Recipients (Q7):
 *   - `attendees` accepts CSV string OR array of strings; handler runs
 *     `parseRecipients` to flatten. Each parsed address becomes
 *     `{ emailAddress: { address }, type: "required" }` — Slice 7
 *     create_event hardcodes `type: "required"` because the schema
 *     surface doesn't let the user distinguish per-address required vs
 *     optional. The `add_attendees` action exposes `attendeeType`
 *     explicitly for that.
 *
 * Builder-friendly flat-time-fields shim (Slice 4.OUTLOOK-CAL-META-2):
 *   FieldMetaSchema has no nested-object FieldType, so the builder cannot
 *   reasonably ask workflow authors to hand-type `{"dateTime":"…","timeZone":"…"}`
 *   JSON. Approach A adds an ADDITIVE, NARROW preprocess that accepts
 *   the flat shape `{startDateTime, startTimeZone?, endDateTime, endTimeZone?}`
 *   and normalizes it to the canonical nested shape BEFORE strict
 *   validation. The handler is unchanged — it always receives the
 *   nested shape after parse(). Direct nested-input callers (existing
 *   handler tests, API consumers) continue to work without changes.
 *
 *   Decision: if BOTH nested and flat are present (e.g. mixed paste),
 *   nested wins. Empty/whitespace-only flat strings are ignored (treated
 *   as "field absent" — Q11 cross-field validation still fires).
 *
 * Strict mode rejects unknown fields.
 */

const DateTimeFieldSchema = z
  .object({
    /**
     * ISO-8601 datetime string. Examples:
     *   - "2026-05-15T14:30:00"          — naive; timeZone field decides
     *   - "2026-05-15T14:30:00Z"         — UTC; Graph accepts but the
     *                                      handler still passes timeZone
     *   - "2026-05-15T14:30:00-05:00"    — with offset
     *
     * The handler passes `dateTime` to Graph verbatim (no trimming of
     * trailing Z or offset, V1 rot fix).
     */
    dateTime: z.string().min(1),
    /**
     * IANA timezone name (e.g. "America/New_York"). Optional — handler
     * resolves to UTC via `resolveTimezone` when omitted. Q12 policy.
     */
    timeZone: z.string().optional(),
  })
  .strict();

const AttendeesField = z.union([
  z.string(),
  z.array(z.string()),
]);

/**
 * Approach-A normalizer: rewrites `{startDateTime, startTimeZone?, …}`
 * (builder shape) into `{start: {dateTime, timeZone?}, end: …}` (runtime
 * shape) before strict validation. Pass-through when only the nested
 * shape is present (zero behavior change for existing callers). Mixed
 * input (nested + flat) prefers nested.
 */
function normalizeFlatStartEnd(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;

  const hasFlat =
    "startDateTime" in r ||
    "endDateTime" in r ||
    "startTimeZone" in r ||
    "endTimeZone" in r;
  if (!hasFlat) return r;

  const {
    startDateTime,
    startTimeZone,
    endDateTime,
    endTimeZone,
    start: nestedStart,
    end: nestedEnd,
    ...rest
  } = r;

  const out: Record<string, unknown> = { ...rest };

  // Nested wins on mixed input.
  if (nestedStart !== undefined) {
    out.start = nestedStart;
  } else if (typeof startDateTime === "string" && startDateTime.trim().length > 0) {
    const s: Record<string, unknown> = { dateTime: startDateTime };
    if (typeof startTimeZone === "string" && startTimeZone.trim().length > 0) {
      s.timeZone = startTimeZone;
    }
    out.start = s;
  }

  if (nestedEnd !== undefined) {
    out.end = nestedEnd;
  } else if (typeof endDateTime === "string" && endDateTime.trim().length > 0) {
    const e: Record<string, unknown> = { dateTime: endDateTime };
    if (typeof endTimeZone === "string" && endTimeZone.trim().length > 0) {
      e.timeZone = endTimeZone;
    }
    out.end = e;
  }

  return out;
}

const RawCreateEventConfigSchema = z
  .object({
    /** Required, may be empty (Graph accepts no-subject events). */
    subject: z.string(),
    start: DateTimeFieldSchema,
    end: DateTimeFieldSchema,
    /** Q11 required: no hidden default for all-day vs timed. */
    isAllDay: z.boolean(),
    /** Q11 required: no hidden default for RSVP behavior. */
    responseRequested: z.boolean(),
    body: z.string().optional(),
    /** Q11 required IF body is non-empty (cross-field refine below). */
    bodyContentType: z.enum(["Text", "HTML"]).optional(),
    location: z.string().optional(),
    /** Q7: CSV or array. Handler parses + maps to Graph attendees. */
    attendees: AttendeesField.optional(),
    /** Optional reminder; absent → Graph uses tenant default. */
    reminderMinutesBeforeStart: z.number().int().min(0).optional(),
    showAs: z
      .enum(["free", "tentative", "busy", "oof", "workingElsewhere"])
      .optional(),
    sensitivity: z
      .enum(["normal", "personal", "private", "confidential"])
      .optional(),
    importance: z.enum(["low", "normal", "high"]).optional(),
  })
  .strict()
  .refine(
    (cfg) => !cfg.body || cfg.bodyContentType !== undefined,
    {
      message:
        "bodyContentType is required when body is non-empty (Q11 — no hidden default).",
      path: ["bodyContentType"],
    },
  );

export const CreateEventConfigSchema = z.preprocess(
  normalizeFlatStartEnd,
  RawCreateEventConfigSchema,
);

export type CreateEventConfig = z.infer<typeof CreateEventConfigSchema>;
