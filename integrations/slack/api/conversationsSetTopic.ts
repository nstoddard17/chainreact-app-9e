import { slackApiRequest, type SlackOkResponse } from "./_request";
import { SlackApiError } from "./errors";

/**
 * Slack `conversations.setTopic` client (Slack 2.3 Commit 3).
 *
 * Sets a channel's topic. Slack docs:
 *   https://api.slack.com/methods/conversations.setTopic
 *
 * Scope: `channels:manage` for public; `groups:write` for private.
 *
 * Slack truncates topics to 250 characters and may strip formatting;
 * the wrapper passes the caller's string through and surfaces the
 * stored value in the returned channel object.
 */
export interface ConversationsSetTopicInput {
  botToken: string;
  channel: string;
  topic: string;
}

export interface ConversationsSetTopicResult {
  channel: Readonly<Record<string, unknown>>;
}

interface SlackResponseBody extends SlackOkResponse {
  channel?: Record<string, unknown>;
}

export async function conversationsSetTopic(
  input: ConversationsSetTopicInput,
): Promise<ConversationsSetTopicResult> {
  const response = await slackApiRequest<SlackResponseBody>(
    "conversations.setTopic",
    input.botToken,
    { channel: input.channel, topic: input.topic },
  );
  if (!response.channel) {
    throw new SlackApiError("channel_not_found");
  }
  return { channel: response.channel };
}
