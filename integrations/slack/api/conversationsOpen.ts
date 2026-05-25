import { SlackApiError } from "./errors";
import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `conversations.open` client.
 *
 * Opens (or returns the existing) DM channel between the bot's authed user
 * and the target user. Used by `send_direct_message` to resolve a DM
 * channel id from a Slack user id before posting via chat.postMessage.
 *
 * Slack docs: https://api.slack.com/methods/conversations.open
 *
 * `users` may be a single Slack user id (`U…`) for a 1:1 DM, or a
 * comma-joined list for a group DM (`mpim`). Slack 2.1's
 * `send_direct_message` ports only the 1:1 case — group DMs are out of
 * scope.
 */
export interface ConversationsOpenInput {
  botToken: string;
  /** Comma-joined Slack user ids (`U1` or `U1,U2,U3`). */
  users: string;
}

export interface ConversationsOpenResult {
  /** DM / mpim channel id Slack resolved or created (`D…` or `G…`). */
  channelId: string;
}

interface SlackResponseBody extends SlackOkResponse {
  channel?: { id?: string };
}

export async function conversationsOpen(
  input: ConversationsOpenInput,
): Promise<ConversationsOpenResult> {
  const body = await slackApiRequest<SlackResponseBody>(
    "conversations.open",
    input.botToken,
    { users: input.users },
  );
  if (!body.channel?.id) {
    throw new SlackApiError("malformed_response");
  }
  return { channelId: body.channel.id };
}
