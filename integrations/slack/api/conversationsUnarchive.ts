import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `conversations.unarchive` client (Slack 2.3 Commit 3).
 *
 * Unarchives a previously archived channel. Slack docs:
 *   https://api.slack.com/methods/conversations.unarchive
 *
 * Scope: `channels:manage` for public; `groups:write` for private.
 */
export interface ConversationsUnarchiveInput {
  botToken: string;
  channel: string;
}

export async function conversationsUnarchive(
  input: ConversationsUnarchiveInput,
): Promise<void> {
  await slackApiRequest<SlackOkResponse>(
    "conversations.unarchive",
    input.botToken,
    { channel: input.channel },
  );
}
