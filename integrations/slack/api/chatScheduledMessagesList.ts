import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `chat.scheduledMessages.list` client.
 *
 * Lists scheduled messages the requesting token can see. Optional
 * `channel` filter narrows to a single channel; omitted lists all
 * scheduled messages the bot owns workspace-wide.
 *
 * Slack docs: https://api.slack.com/methods/chat.scheduledMessages.list
 *
 * Pagination matches conversations.history shape: caller passes a
 * `cursor` from the previous response's `nextCursor`. Empty cursor
 * means "start fresh."
 *
 * Each `scheduled_messages` entry has Slack's snake_case fields:
 *   { id, channel_id, post_at, date_created, text }
 * The wrapper passes them through verbatim — workflow templates can
 * index `{{nodeId.messages[0].channel_id}}` etc.
 */
export interface ChatScheduledMessagesListInput {
  botToken: string;
  /** Optional channel filter. */
  channel?: string;
  /** Slack accepts up to 1000; default 100. */
  limit?: number;
  /** Slack timestamp lower bound for scheduled-time filtering. */
  oldest?: string;
  /** Slack timestamp upper bound for scheduled-time filtering. */
  latest?: string;
  /** Opaque pagination cursor returned in the previous response. */
  cursor?: string;
}

export interface ChatScheduledMessagesListResult {
  messages: ReadonlyArray<Readonly<Record<string, unknown>>>;
  hasMore: boolean;
  nextCursor: string | null;
}

interface SlackResponseBody extends SlackOkResponse {
  scheduled_messages?: Array<Record<string, unknown>>;
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
}

export async function chatScheduledMessagesList(
  input: ChatScheduledMessagesListInput,
): Promise<ChatScheduledMessagesListResult> {
  const body: Record<string, unknown> = {};
  if (input.channel !== undefined) body.channel = input.channel;
  if (input.limit !== undefined) body.limit = input.limit;
  if (input.oldest !== undefined) body.oldest = input.oldest;
  if (input.latest !== undefined) body.latest = input.latest;
  if (input.cursor !== undefined) body.cursor = input.cursor;

  const response = await slackApiRequest<SlackResponseBody>(
    "chat.scheduledMessages.list",
    input.botToken,
    body,
  );
  const cursor = response.response_metadata?.next_cursor;
  return {
    messages: response.scheduled_messages ?? [],
    hasMore: response.has_more ?? false,
    nextCursor: cursor && cursor.length > 0 ? cursor : null,
  };
}
