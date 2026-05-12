import { z } from "zod";

/**
 * Resolved-config schema for the Slack get_messages action.
 *
 * Reads a window of messages from a channel via `conversations.history`.
 *
 * `limit` is clamped to Slack's max of 1000 (server-side); the schema
 * accepts up to 1000 and the handler relies on Slack to enforce. Default
 * 100 (Slack's default).
 *
 * `oldest` / `latest` are Slack message timestamps in string form
 * ("1730000000.000123"). The schema does NOT accept ISO-8601 — caller
 * must convert at variable resolution time (or upstream node outputs
 * a Slack ts directly).
 *
 * `cursor` is opaque pagination state — pass through from a previous
 * call's `output.nextCursor`. Empty cursor means start from the most
 * recent message.
 */
export const GetMessagesConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  limit: z.number().int().min(1).max(1000).optional(),
  oldest: z.string().min(1).optional(),
  latest: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
});
export type GetMessagesConfig = z.infer<typeof GetMessagesConfigSchema>;
