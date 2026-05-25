import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `conversations.list` client (Slack 2.3 Commit 2).
 *
 * Reads a paginated window of channels visible to the bot. Cursor-based
 * pagination — caller passes the previous response's `nextCursor` back
 * as `cursor` on the next call. Slack returns an empty-string cursor at
 * the end of pagination; we normalize that to `null` so callers don't
 * accidentally request a duplicate page.
 *
 * Slack docs: https://api.slack.com/methods/conversations.list
 *
 * Scopes required vary by `types`:
 *   - public_channel → `channels:read`
 *   - private_channel → `groups:read`
 *   - im → `im:read` (not used in 2.3)
 *   - mpim → `mpim:read` (not used in 2.3)
 *
 * Slack 2.3 uses public + private only. The wrapper does not enforce
 * scope — the manifest is the source of truth for what's granted; the
 * handler chooses which `types` to pass.
 */
export interface ConversationsListInput {
  botToken: string;
  /**
   * Comma-separated Slack channel kinds: `public_channel`,
   * `private_channel`, `im`, `mpim`. Slack defaults to `public_channel`
   * when omitted; the handler always supplies an explicit value.
   */
  types?: string;
  /** When true, omit archived channels from the response. */
  excludeArchived?: boolean;
  /** Slack accepts up to 1000; Slack's default is 100. */
  limit?: number;
  /** Opaque pagination cursor returned in the previous response. */
  cursor?: string;
}

export interface ConversationsListResult {
  channels: ReadonlyArray<Readonly<Record<string, unknown>>>;
  /** True when Slack indicates more pages exist. */
  hasMore: boolean;
  /** Pass to the next call as `cursor`; `null` when at the end. */
  nextCursor: string | null;
}

interface SlackResponseBody extends SlackOkResponse {
  channels?: Array<Record<string, unknown>>;
  response_metadata?: { next_cursor?: string };
}

export async function conversationsList(
  input: ConversationsListInput,
): Promise<ConversationsListResult> {
  const body: Record<string, unknown> = {};
  if (input.types !== undefined) body.types = input.types;
  if (input.excludeArchived !== undefined) {
    body.exclude_archived = input.excludeArchived;
  }
  if (input.limit !== undefined) body.limit = input.limit;
  if (input.cursor !== undefined) body.cursor = input.cursor;

  const response = await slackApiRequest<SlackResponseBody>(
    "conversations.list",
    input.botToken,
    body,
  );

  const cursor = response.response_metadata?.next_cursor;
  const normalizedCursor = cursor && cursor.length > 0 ? cursor : null;
  return {
    channels: response.channels ?? [],
    // Slack does NOT return `has_more` on conversations.list — pagination
    // is signaled solely by a non-empty `response_metadata.next_cursor`.
    hasMore: normalizedCursor !== null,
    nextCursor: normalizedCursor,
  };
}
