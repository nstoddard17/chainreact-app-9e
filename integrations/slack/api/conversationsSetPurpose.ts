import { slackApiRequest, type SlackOkResponse } from "./_request";
import { SlackApiError } from "./errors";

/**
 * Slack `conversations.setPurpose` client (Slack 2.3 Commit 3).
 *
 * Sets a channel's purpose. Slack docs:
 *   https://api.slack.com/methods/conversations.setPurpose
 *
 * Scope: `channels:manage` for public; `groups:write` for private.
 *
 * Slack truncates purpose to 250 characters and may strip formatting;
 * the wrapper passes the caller's string through and surfaces the
 * stored value in the returned channel object.
 */
export interface ConversationsSetPurposeInput {
  botToken: string;
  channel: string;
  purpose: string;
}

export interface ConversationsSetPurposeResult {
  channel: Readonly<Record<string, unknown>>;
}

interface SlackResponseBody extends SlackOkResponse {
  channel?: Record<string, unknown>;
}

export async function conversationsSetPurpose(
  input: ConversationsSetPurposeInput,
): Promise<ConversationsSetPurposeResult> {
  const response = await slackApiRequest<SlackResponseBody>(
    "conversations.setPurpose",
    input.botToken,
    { channel: input.channel, purpose: input.purpose },
  );
  if (!response.channel) {
    throw new SlackApiError("channel_not_found");
  }
  return { channel: response.channel };
}
