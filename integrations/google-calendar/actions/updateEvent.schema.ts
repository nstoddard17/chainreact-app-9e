import { z } from "zod";

/**
 * Resolved-config schema for the Google Calendar update_event action.
 *
 * V2 uses `events.patch` (merge-patch) under the hood: only fields
 * present in this config are sent to Google. Anything omitted stays
 * untouched on the existing event — no V1-style "fetch then merge"
 * reconstruction, no synthetic `'09:00'` fallback (the V1 bug this port
 * fixes — when the existing event lacked start/end, V1 substituted
 * `'09:00'` + 60 min). In V2, time edits require BOTH `startDateTime`
 * AND `endDateTime`; supplying one without the other fails the schema.
 *
 * Q11: only `sendNotifications` is required on update — the guests-*
 * fields are optional because update flows often don't touch them.
 *
 * Google Meet: boolean only. `googleMeet=true` ADDS a Meet conference;
 * `googleMeet=false` is a no-op for now (removing an existing conference
 * is out of scope for Batch 1).
 */
export const UpdateEventConfigSchema = z
  .object({
    calendarId: z.string().min(1).default("primary"),
    eventId: z.string().min(1, "eventId is required."),

    summary: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),

    startDateTime: z.string().optional(),
    endDateTime: z.string().optional(),
    timezone: z.string().optional(),

    attendees: z.union([z.string(), z.array(z.string())]).optional(),

    googleMeet: z.boolean().optional(),

    // Q11 required:
    sendNotifications: z.enum(["all", "externalOnly", "none"]),

    // Optional:
    guestsCanInviteOthers: z.boolean().optional(),
    guestsCanSeeOtherGuests: z.boolean().optional(),
    guestsCanModify: z.boolean().optional(),
    visibility: z.enum(["default", "public", "private", "confidential"]).optional(),
    transparency: z.enum(["opaque", "transparent"]).optional(),
    colorId: z.string().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    // If updating times, both must be supplied. Failing fast here is the
    // explicit replacement for V1's `'09:00'` synthesis bug.
    const startGiven = val.startDateTime !== undefined;
    const endGiven = val.endDateTime !== undefined;
    if (startGiven !== endGiven) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDateTime"],
        message:
          "When updating event times, BOTH startDateTime and endDateTime must be provided.",
      });
    }
  });

export type UpdateEventConfig = z.infer<typeof UpdateEventConfigSchema>;
