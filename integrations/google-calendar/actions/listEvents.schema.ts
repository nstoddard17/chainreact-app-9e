import { z } from "zod";

/**
 * Resolved-config schema for the Google Calendar list_events action.
 *
 * Read-only — no Q11 fields, no idempotency. `singleEvents` defaults true
 * (expands recurring events into individual instances), matching what
 * most workflow authors want when listing events to filter or summarize.
 */
export const ListEventsConfigSchema = z
  .object({
    calendarId: z.string().min(1).default("primary"),
    /** ISO 8601 lower bound (event end is after this). */
    timeMin: z.string().optional(),
    /** ISO 8601 upper bound (event start is before this). */
    timeMax: z.string().optional(),
    /** Google's hard cap is 2500 per page; default to a sane 250. */
    maxResults: z.number().int().min(1).max(2500).default(250),
    /** Free-text query against summary/description/location/attendees. */
    query: z.string().optional(),
    orderBy: z.enum(["startTime", "updated"]).optional(),
    singleEvents: z.boolean().default(true),
    showDeleted: z.boolean().default(false),
    pageToken: z.string().optional(),
  })
  .strict();

export type ListEventsConfig = z.infer<typeof ListEventsConfigSchema>;
