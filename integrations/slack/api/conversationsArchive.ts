import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `conversations.archive` client (Slack 2.3 Commit 3).
 *
 * Archives a channel (public or private). Slack docs:
 *   https://api.slack.com/methods/conversations.archive
 *
 * Scope: `channels:manage` for public; `groups:write` for private.
 *
 * Slack returns only `{ ok: true }` on success; the wrapper resolves
 * to `void` and lets `slackApiRequest` raise on logical failure.
 */
export interface ConversationsArchiveInput {
  botToken: string;
  channel: string;
}

export async function conversationsArchive(
  input: ConversationsArchiveInput,
): Promise<void> {
  await slackApiRequest<SlackOkResponse>(
    "conversations.archive",
    input.botToken,
    { channel: input.channel },
  );
}
