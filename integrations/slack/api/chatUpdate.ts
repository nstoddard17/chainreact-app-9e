import { SlackApiError } from "./errors";
import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `chat.update` client.
 *
 * Updates an existing message's text. Slack 2.1 ports only the bot-token
 * text-update path — no Block Kit, no `as_user` fallback (V1 had logic to
 * retry with a user token when the bot couldn't update a user-posted
 * message; that path requires P-S1 user-token storage which is deferred).
 *
 * Slack docs: https://api.slack.com/methods/chat.update
 *
 * The message id is the Slack timestamp (`ts`) — the same value
 * chat.postMessage returns. The channel must be the channel the original
 * message was posted in; chat.update doesn't accept channel-name strings.
 */
export interface ChatUpdateInput {
  botToken: string;
  /** Channel id (`C…`, `D…`, `G…`). */
  channel: string;
  /** Slack message id (timestamp like "1730000000.000123"). */
  ts: string;
  /** New message text. */
  text: string;
}

export interface ChatUpdateResult {
  channel: string;
  ts: string;
  text: string;
}

interface SlackResponseBody extends SlackOkResponse {
  channel?: string;
  ts?: string;
  text?: string;
}

export async function chatUpdate(input: ChatUpdateInput): Promise<ChatUpdateResult> {
  const body = await slackApiRequest<SlackResponseBody>(
    "chat.update",
    input.botToken,
    {
      channel: input.channel,
      ts: input.ts,
      text: input.text,
    },
  );
  if (!body.channel || !body.ts || body.text === undefined) {
    throw new SlackApiError("malformed_response");
  }
  return { channel: body.channel, ts: body.ts, text: body.text };
}
