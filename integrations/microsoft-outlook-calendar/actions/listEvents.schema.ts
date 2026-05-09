import { z } from "zod";

/**
 * Resolved-config schema for the Outlook Calendar list_events action.
 *
 * Date range policy:
 *   - `startDateTime` and `endDateTime` are BOTH optional but MUST be
 *     provided together. The cross-field refine enforces this. When
 *     both are provided, the handler uses /me/calendarView (auto-
 *     expands recurring events into individual occurrences). Without
 *     a range, /me/events returns master events for recurring series.
 *   - "Do not silently synthesize missing times" — the schema does NOT
 *     default to "today" or any sentinel. If the caller wants a date
 *     range, they pass two ISO-8601 timestamps explicitly.
 *
 * `top` is bounded to [1, 100] (Graph's `$top` cap on /me/events).
 *
 * Strict mode rejects unknown fields.
 */
export const ListEventsConfigSchema = z
  .object({
    /** ISO-8601 timestamp; required if endDateTime is present. */
    startDateTime: z.string().optional(),
    /** ISO-8601 timestamp; required if startDateTime is present. */
    endDateTime: z.string().optional(),
    /** Max results to return. Default 25, max 100. */
    top: z.number().int().min(1).max(100).default(25),
    /**
     * Sort field. "start" is the canonical chronological sort;
     * the wrapper translates to Graph's per-endpoint orderable name.
     */
    orderBy: z.enum(["start", "subject"]).default("start"),
    /** Optional substring filter on subject (Graph $filter). */
    subjectFilter: z.string().optional(),
  })
  .strict()
  .refine(
    (cfg) => Boolean(cfg.startDateTime) === Boolean(cfg.endDateTime),
    {
      message:
        "startDateTime and endDateTime must be provided together (both or neither).",
      path: ["endDateTime"],
    },
  );

export type ListEventsConfig = z.infer<typeof ListEventsConfigSchema>;
