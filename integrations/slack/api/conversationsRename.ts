import { slackApiRequest, type SlackOkResponse } from "./_request";
import { SlackApiError } from "./errors";

/**
 * Slack `conversations.rename` client (Slack 2.3 Commit 3).
 *
 * Renames a channel. Slack docs:
 *   https://api.slack.com/methods/conversations.rename
 *
 * Scope: `channels:manage` for public; `groups:write` for private.
 *
 * Slack normalizes the name server-side; the wrapper passes the
 * raw caller-supplied name through. Returns the updated channel
 * object verbatim.
 */
export interface ConversationsRenameInput {
  botToken: string;
  channel: string;
  name: string;
}

export interface ConversationsRenameResult {
  channel: Readonly<Record<string, unknown>>;
}

interface SlackResponseBody extends SlackOkResponse {
  channel?: Record<string, unknown>;
}

export async function conversationsRename(
  input: ConversationsRenameInput,
): Promise<ConversationsRenameResult> {
  const response = await slackApiRequest<SlackResponseBody>(
    "conversations.rename",
    input.botToken,
    { channel: input.channel, name: input.name },
  );
  if (!response.channel) {
    throw new SlackApiError("channel_not_found");
  }
  return { channel: response.channel };
}
