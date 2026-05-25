import { z } from "zod";

/**
 * Resolved-config schema for the Google Calendar create_event action.
 *
 * The engine pre-resolves all `{{...}}` references; by the time this
 * schema runs every value is concrete.
 *
 * Q11 required fields (no hidden defaults):
 *   - sendNotifications, guestsCanInviteOthers, guestsCanSeeOtherGuests
 *     are required regardless of whether the event has attendees. The
 *     guests-* fields are only forwarded to Google when attendees > 0
 *     (Google ignores them otherwise), but Q11 requires the workflow
 *     author to make the choice explicitly.
 *
 * Time encoding (mutually exclusive):
 *   - allDay=false (default): startDateTime + endDateTime (ISO 8601).
 *     `timezone` is optional and applies to both; resolveTimezone falls
 *     back to UTC when unset/invalid.
 *   - allDay=true: startDate + endDate (YYYY-MM-DD). Calendar's all-day
 *     end is exclusive (date the day AFTER the event ends).
 *
 * Google Meet (boolean only — V1's mixed boolean/object shape is fixed):
 *   - googleMeet=true → handler attaches conferenceData.createRequest with
 *     a stable requestId derived from `runId + nodeId` (Q4 invariant —
 *     replays produce the same Meet link rather than a new one each retry).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const CreateEventConfigSchema = z
  .object({
    calendarId: z.string().min(1).default("primary"),
    summary: z.string().min(1, "summary is required."),
    description: z.string().optional(),
    location: z.string().optional(),

    allDay: z.boolean().default(false),
    startDateTime: z.string().optional(),
    endDateTime: z.string().optional(),
    startDate: z.string().regex(ISO_DATE, "startDate must be YYYY-MM-DD.").optional(),
    endDate: z.string().regex(ISO_DATE, "endDate must be YYYY-MM-DD.").optional(),
    timezone: z.string().optional(),

    attendees: z.union([z.string(), z.array(z.string())]).optional(),
    googleMeet: z.boolean().default(false),

    // Q11 required:
    sendNotifications: z.enum(["all", "externalOnly", "none"]),
    guestsCanInviteOthers: z.boolean(),
    guestsCanSeeOtherGuests: z.boolean(),

    // Optional:
    guestsCanModify: z.boolean().optional(),
    visibility: z.enum(["default", "public", "private", "confidential"]).optional(),
    transparency: z.enum(["opaque", "transparent"]).optional(),
    colorId: z.string().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.allDay) {
      if (!val.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startDate"],
          message: "startDate (YYYY-MM-DD) is required when allDay is true.",
        });
      }
      if (!val.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDate"],
          message: "endDate (YYYY-MM-DD) is required when allDay is true.",
        });
      }
    } else {
      if (!val.startDateTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startDateTime"],
          message: "startDateTime (ISO 8601) is required when allDay is false.",
        });
      }
      if (!val.endDateTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDateTime"],
          message: "endDateTime (ISO 8601) is required when allDay is false.",
        });
      }
    }
  });

export type CreateEventConfig = z.infer<typeof CreateEventConfigSchema>;
