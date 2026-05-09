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

export const CreateEventConfigSchema = z
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

export type CreateEventConfig = z.infer<typeof CreateEventConfigSchema>;
