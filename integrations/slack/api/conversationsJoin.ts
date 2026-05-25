import { slackApiRequest, type SlackOkResponse } from "./_request";
import { SlackApiError } from "./errors";

/**
 * Slack `conversations.join` client (Slack 2.3 Commit 3).
 *
 * Adds the calling user (the bot, with a bot token) to a channel.
 * Slack docs: https://api.slack.com/methods/conversations.join
 *
 * Scope: `channels:join` for public; `groups:write` for private.
 *
 * Slack returns the joined channel object on success.
 */
export interface ConversationsJoinInput {
  botToken: string;
  channel: string;
}

export interface ConversationsJoinResult {
  channel: Readonly<Record<string, unknown>>;
}

interface SlackResponseBody extends SlackOkResponse {
  channel?: Record<string, unknown>;
}

export async function conversationsJoin(
  input: ConversationsJoinInput,
): Promise<ConversationsJoinResult> {
  const response = await slackApiRequest<SlackResponseBody>(
    "conversations.join",
    input.botToken,
    { channel: input.channel },
  );
  if (!response.channel) {
    throw new SlackApiError("channel_not_found");
  }
  return { channel: response.channel };
}
