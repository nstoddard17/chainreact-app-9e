import { slackApiRequestForm, type SlackOkResponse } from "./_request";

/**
 * Slack `conversations.members` client (membership read-back).
 *
 * Lists the user ids that belong to a channel. Cursor-based pagination — caller
 * passes the previous response's `nextCursor` back as `cursor`. Slack returns an
 * empty-string cursor at the end of pagination; normalized to `null` uniformly with
 * the other Slack list wrappers.
 *
 * Slack docs: https://api.slack.com/methods/conversations.members
 *
 * TRANSPORT: form-encoded (`slackApiRequestForm`), NOT JSON — same class as
 * `conversations.info` / `users.info`, whose flat scalar params Slack rejects on the
 * `application/json` body with `invalid_arguments`. `conversations.members` takes only
 * flat scalars (`channel` / `limit` / `cursor`), so it uses the form transport too.
 *
 * Scope: `channels:read` for public; `groups:read` for private. No name-resolution —
 * caller passes a channel id (C… / G…).
 *
 * This wrapper is SMOKE-ONLY today (the membership read-back seam that verifies
 * invite_users_to_channel / remove_user_from_channel). It is not wired to a
 * user-facing registered action; if one is added later it can consume this unchanged.
 */
export interface ConversationsMembersInput {
  botToken: string;
  /** Slack channel id (C… or G…). No name-resolution. */
  channel: string;
  /** Slack accepts up to 1000; defaults to the workspace tier. */
  limit?: number;
  /** Opaque pagination cursor returned in the previous response. */
  cursor?: string;
}

export interface ConversationsMembersResult {
  /** Member user ids (U…) in this channel. */
  members: readonly string[];
  /** Pass to the next call as `cursor`; `null` when at the end. */
  nextCursor: string | null;
}

interface SlackResponseBody extends SlackOkResponse {
  members?: string[];
  response_metadata?: { next_cursor?: string };
}

export async function conversationsMembers(
  input: ConversationsMembersInput,
): Promise<ConversationsMembersResult> {
  const response = await slackApiRequestForm<SlackResponseBody>(
    "conversations.members",
    input.botToken,
    { channel: input.channel, limit: input.limit, cursor: input.cursor },
  );

  const cursor = response.response_metadata?.next_cursor;
  const normalizedCursor = cursor && cursor.length > 0 ? cursor : null;
  return {
    members: response.members ?? [],
    nextCursor: normalizedCursor,
  };
}
