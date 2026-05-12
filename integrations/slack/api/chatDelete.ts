import { SlackApiError } from "./errors";
import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `chat.delete` client.
 *
 * Deletes a message identified by `(channel, ts)`. Slack 2.1 ports only
 * the bot-token path; V1's `asUser=true` shortcut required a user token
 * (P-S1 deferred). On Slack's side, a bot can only delete messages it
 * posted (or that the workspace's admin-level scopes permit) — caller
 * sees `cant_delete_message` if Slack refuses.
 *
 * Slack docs: https://api.slack.com/methods/chat.delete
 */
export interface ChatDeleteInput {
  botToken: string;
  /** Channel id (`C…`, `D…`, `G…`). */
  channel: string;
  /** Slack message id (timestamp). */
  ts: string;
}

export interface ChatDeleteResult {
  channel: string;
  ts: string;
}

interface SlackResponseBody extends SlackOkResponse {
  channel?: string;
  ts?: string;
}

export async function chatDelete(input: ChatDeleteInput): Promise<ChatDeleteResult> {
  const body = await slackApiRequest<SlackResponseBody>(
    "chat.delete",
    input.botToken,
    {
      channel: input.channel,
      ts: input.ts,
    },
  );
  if (!body.channel || !body.ts) {
    throw new SlackApiError("malformed_response");
  }
  return { channel: body.channel, ts: body.ts };
}
