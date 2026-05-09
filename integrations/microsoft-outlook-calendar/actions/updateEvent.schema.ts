import { z } from "zod";

/**
 * Resolved-config schema for the Outlook Calendar update_event action.
 *
 * PATCH semantics: only fields explicitly provided are sent to Graph.
 * Omitted fields stay unchanged on the server. Because Graph PATCH on
 * `attendees` REPLACES the full list, callers who want to APPEND
 * attendees should use the `add_attendees` action — Slice 7 plan
 * §"`add_attendees` — append, not replace".
 *
 * Q11 — fields with no hidden defaults still apply when explicitly
 * provided:
 *   - `bodyContentType` is required IF `body` is provided (cross-field
 *     refine).
 *
 * Date/time policy:
 *   - When `start` is provided, `start.dateTime` is required (a non-
 *     empty string). When `end` is provided, `end.dateTime` is
 *     required. This is enforced by the per-field `DateTimeFieldSchema`
 *     `.strict()` + `min(1)`.
 *   - "Do not silently synthesize missing times" — V1's update_event
 *     auto-calculated +1h end when only start was provided. V2 does
 *     NOT — workflow authors pass both or one. Graph itself rejects
 *     PATCHes with only one of start/end (validation surfaces from
 *     Graph as `ErrorInvalidArgument`); the schema doesn't pre-empt
 *     that, but documents the requirement.
 *
 * At least one mutable field beyond `eventId` must be provided —
 * otherwise the PATCH is a no-op that wastes a round-trip.
 *
 * Strict mode rejects unknown fields.
 */

const DateTimeFieldSchema = z
  .object({
    dateTime: z.string().min(1),
    timeZone: z.string().optional(),
  })
  .strict();

const AttendeesField = z.union([z.string(), z.array(z.string())]);

export const UpdateEventConfigSchema = z
  .object({
    eventId: z.string().min(1, "eventId is required."),
    subject: z.string().optional(),
    start: DateTimeFieldSchema.optional(),
    end: DateTimeFieldSchema.optional(),
    isAllDay: z.boolean().optional(),
    responseRequested: z.boolean().optional(),
    body: z.string().optional(),
    bodyContentType: z.enum(["Text", "HTML"]).optional(),
    location: z.string().optional(),
    attendees: AttendeesField.optional(),
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
    (cfg) => {
      // Count keys other than eventId. The spread would be cleaner but
      // strict mode preserves the original keys, so iterate.
      const mutableKeys = Object.keys(cfg).filter((k) => k !== "eventId");
      return mutableKeys.length > 0;
    },
    {
      message:
        "update_event requires at least one mutable field besides eventId.",
    },
  )
  .refine(
    (cfg) => !cfg.body || cfg.bodyContentType !== undefined,
    {
      message:
        "bodyContentType is required when body is non-empty (Q11 — no hidden default).",
      path: ["bodyContentType"],
    },
  );

export type UpdateEventConfig = z.infer<typeof UpdateEventConfigSchema>;
