import { z } from "zod";

/**
 * Resolved-config schema for the Slack list_scheduled_messages action.
 *
 * All fields optional. `channel` narrows to a single channel; absent
 * lists every scheduled message the bot owns workspace-wide.
 *
 * Pagination mirrors get_messages: `cursor` from the previous response's
 * `nextCursor`; empty/absent cursor means start fresh.
 *
 * `oldest` / `latest` are Slack timestamps in string form
 * ("1730000000.000123") — same convention as get_messages. They filter
 * by the scheduled `post_at` value, not by `date_created`.
 */
export const ListScheduledMessagesConfigSchema = z.object({
  channel: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  oldest: z.string().min(1).optional(),
  latest: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
});
export type ListScheduledMessagesConfig = z.infer<typeof ListScheduledMessagesConfigSchema>;
