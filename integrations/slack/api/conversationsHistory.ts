import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `conversations.history` client.
 *
 * Reads a paginated window of messages from a channel. Slack 2.1 ports
 * the bot-token path and exposes Slack's cursor-based pagination directly
 * via `nextCursor` — caller passes it back as `cursor` on the next call.
 *
 * Slack docs: https://api.slack.com/methods/conversations.history
 *
 * Time bounds (`oldest`, `latest`) are Slack message timestamps
 * ("1730000000.000123") — string form. The wrapper does not convert
 * ISO-8601 / RFC strings to Slack timestamps; the action handler does
 * that conversion at its boundary if needed.
 *
 * Slice 2.1 reads public channels only (channels:history scope). Private
 * channels need groups:history (deferred to Slack 2.2); DMs need
 * im:history and group DMs mpim:history (added as required scopes in
 * Commit 8 for the trigger filters, also used by this action).
 */
export interface ConversationsHistoryInput {
  botToken: string;
  channel: string;
  /** Slack accepts up to 1000; default 100. */
  limit?: number;
  /** Slack timestamp lower bound (exclusive). */
  oldest?: string;
  /** Slack timestamp upper bound (exclusive). */
  latest?: string;
  /** Opaque pagination cursor returned in the previous response. */
  cursor?: string;
}

export interface ConversationsHistoryResult {
  messages: ReadonlyArray<Readonly<Record<string, unknown>>>;
  hasMore: boolean;
  /** Pass to the next call as `cursor`; absent when at the end. */
  nextCursor: string | null;
}

interface SlackResponseBody extends SlackOkResponse {
  messages?: Array<Record<string, unknown>>;
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
}

export async function conversationsHistory(
  input: ConversationsHistoryInput,
): Promise<ConversationsHistoryResult> {
  const body: Record<string, unknown> = { channel: input.channel };
  if (input.limit !== undefined) body.limit = input.limit;
  if (input.oldest !== undefined) body.oldest = input.oldest;
  if (input.latest !== undefined) body.latest = input.latest;
  if (input.cursor !== undefined) body.cursor = input.cursor;

  const response = await slackApiRequest<SlackResponseBody>(
    "conversations.history",
    input.botToken,
    body,
  );
  // Slack guarantees `messages` is an array on `ok: true`; missing is
  // equivalent to empty. Pagination cursor is empty string when there
  // are no more pages — surface as null so callers don't pass an empty
  // cursor on the next call.
  const cursor = response.response_metadata?.next_cursor;
  return {
    messages: response.messages ?? [],
    hasMore: response.has_more ?? false,
    nextCursor: cursor && cursor.length > 0 ? cursor : null,
  };
}
