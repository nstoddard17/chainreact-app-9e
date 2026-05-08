import { z } from "zod";

/**
 * Resolved-config schema for the Google Calendar delete_event action.
 *
 * Q11: `sendNotifications` is required — deleting an event with
 * attendees should explicitly choose whether they get a cancellation
 * email.
 */
export const DeleteEventConfigSchema = z
  .object({
    calendarId: z.string().min(1).default("primary"),
    eventId: z.string().min(1, "eventId is required."),
    // Q11 required:
    sendNotifications: z.enum(["all", "externalOnly", "none"]),
  })
  .strict();

export type DeleteEventConfig = z.infer<typeof DeleteEventConfigSchema>;
