import { z } from "zod";

/**
 * Resolved-config schema for the Google Calendar add_attendees action.
 *
 * Adds attendees without replacing existing ones (handler fetches the
 * existing event, computes the delta case-insensitive, and patches with
 * the merged list). For "replace all attendees" semantics, use
 * `update_event` with the `attendees` field.
 *
 * Q11: `sendNotifications` required — adding attendees with notifications
 * disabled is a deliberate choice the workflow author must make.
 */
export const AddAttendeesConfigSchema = z
  .object({
    calendarId: z.string().min(1).default("primary"),
    eventId: z.string().min(1, "eventId is required."),
    /** CSV string or string array. Routed through `parseRecipients` (Q7). */
    attendees: z.union([z.string(), z.array(z.string())]),
    // Q11 required:
    sendNotifications: z.enum(["all", "externalOnly", "none"]),
  })
  .strict();

export type AddAttendeesConfig = z.infer<typeof AddAttendeesConfigSchema>;
