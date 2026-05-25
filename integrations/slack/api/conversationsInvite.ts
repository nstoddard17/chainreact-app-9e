import { slackApiRequest, type SlackOkResponse } from "./_request";
import { SlackApiError } from "./errors";

/**
 * Slack `conversations.invite` client (Slack 2.3 Commit 3).
 *
 * Invites one or more users to a channel. Slack accepts a comma-
 * separated `users` field. Slack docs:
 *   https://api.slack.com/methods/conversations.invite
 *
 * Scope: `channels:manage` for public; `groups:write` for private.
 *
 * Caller passes a comma-joined string of user ids. The action handler
 * is responsible for parsing the input (array or CSV) and joining.
 *
 * Slack returns the updated channel object on success. Slack 2.3
 * does NOT implement V1's per-user retry fallback — failures surface
 * verbatim and let the workflow author decide.
 */
export interface ConversationsInviteInput {
  botToken: string;
  channel: string;
  /** Comma-separated user ids ("U1,U2,U3"). */
  users: string;
}

export interface ConversationsInviteResult {
  channel: Readonly<Record<string, unknown>>;
}

interface SlackResponseBody extends SlackOkResponse {
  channel?: Record<string, unknown>;
}

export async function conversationsInvite(
  input: ConversationsInviteInput,
): Promise<ConversationsInviteResult> {
  const response = await slackApiRequest<SlackResponseBody>(
    "conversations.invite",
    input.botToken,
    { channel: input.channel, users: input.users },
  );
  if (!response.channel) {
    throw new SlackApiError("channel_not_found");
  }
  return { channel: response.channel };
}
