import { z } from "zod";

/**
 * Resolved-config schema for the Slack get_thread_messages action.
 *
 * Reads a thread (parent + replies) via `conversations.replies`. The
 * parent is `messages[0]`; subsequent entries are replies in
 * chronological order.
 *
 * `threadTs` is the parent message's Slack timestamp — same value as
 * the `ts` field on the parent message.
 *
 * `limit`, `oldest`, `latest`, `cursor`: same semantics as get_messages.
 */
export const GetThreadMessagesConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  threadTs: z.string().min(1, "Slack thread parent ts is required."),
  limit: z.number().int().min(1).max(1000).optional(),
  oldest: z.string().min(1).optional(),
  latest: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
});
export type GetThreadMessagesConfig = z.infer<typeof GetThreadMessagesConfigSchema>;
