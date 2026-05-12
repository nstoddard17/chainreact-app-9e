import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `conversations.replies` client.
 *
 * Reads the replies to a thread (and the thread parent itself — Slack
 * returns the parent as `messages[0]` and replies as `messages[1..]`).
 *
 * Slack docs: https://api.slack.com/methods/conversations.replies
 *
 * Pagination is the same cursor-based shape as conversations.history.
 * `ts` is the thread parent's Slack timestamp — passing a non-thread
 * message id returns just that one message.
 */
export interface ConversationsRepliesInput {
  botToken: string;
  channel: string;
  /** Thread parent's Slack timestamp. */
  ts: string;
  /** Slack accepts up to 1000; default 100. */
  limit?: number;
  /** Slack timestamp lower bound (exclusive). */
  oldest?: string;
  /** Slack timestamp upper bound (exclusive). */
  latest?: string;
  /** Opaque pagination cursor returned in the previous response. */
  cursor?: string;
}

export interface ConversationsRepliesResult {
  messages: ReadonlyArray<Readonly<Record<string, unknown>>>;
  hasMore: boolean;
  nextCursor: string | null;
}

interface SlackResponseBody extends SlackOkResponse {
  messages?: Array<Record<string, unknown>>;
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
}

export async function conversationsReplies(
  input: ConversationsRepliesInput,
): Promise<ConversationsRepliesResult> {
  const body: Record<string, unknown> = {
    channel: input.channel,
    ts: input.ts,
  };
  if (input.limit !== undefined) body.limit = input.limit;
  if (input.oldest !== undefined) body.oldest = input.oldest;
  if (input.latest !== undefined) body.latest = input.latest;
  if (input.cursor !== undefined) body.cursor = input.cursor;

  const response = await slackApiRequest<SlackResponseBody>(
    "conversations.replies",
    input.botToken,
    body,
  );
  const cursor = response.response_metadata?.next_cursor;
  return {
    messages: response.messages ?? [],
    hasMore: response.has_more ?? false,
    nextCursor: cursor && cursor.length > 0 ? cursor : null,
  };
}
