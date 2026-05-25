import { slackApiRequest, type SlackOkResponse } from "./_request";
import { SlackApiError } from "./errors";

/**
 * Slack `conversations.create` client (Slack 2.3 Commit 3).
 *
 * Creates a new public or private channel. Slack docs:
 *   https://api.slack.com/methods/conversations.create
 *
 * Scope: `channels:manage` for public; `groups:write` for private.
 */
export interface ConversationsCreateInput {
  botToken: string;
  name: string;
  isPrivate: boolean;
}

export interface ConversationsCreateResult {
  channel: Readonly<Record<string, unknown>>;
}

interface SlackResponseBody extends SlackOkResponse {
  channel?: Record<string, unknown>;
}

export async function conversationsCreate(
  input: ConversationsCreateInput,
): Promise<ConversationsCreateResult> {
  const response = await slackApiRequest<SlackResponseBody>(
    "conversations.create",
    input.botToken,
    { name: input.name, is_private: input.isPrivate },
  );
  if (!response.channel) {
    throw new SlackApiError("name_taken");
  }
  return { channel: response.channel };
}
