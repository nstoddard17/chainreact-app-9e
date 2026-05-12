import { SlackApiError } from "./errors";
import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `chat.scheduleMessage` client.
 *
 * Schedules a message to be delivered at a specific future Unix timestamp.
 * Slack accepts `post_at` up to 120 days in the future and rejects values
 * in the past with `time_in_past` / `time_too_far`. The wrapper surfaces
 * the Slack error code via SlackApiError.
 *
 * Slack docs: https://api.slack.com/methods/chat.scheduleMessage
 *
 * Slack 2.1 scope: bot-token only, text + optional thread reply. Block
 * Kit is deferred to Commit 7 (post_interactive_blocks).
 */
export interface ChatScheduleMessageInput {
  botToken: string;
  /** Channel id (`C…`, `D…`, `G…`) or `#name`. */
  channel: string;
  /** Message text. */
  text: string;
  /** Absolute Unix-second timestamp when Slack should deliver. */
  postAt: number;
  /** Optional thread parent's Slack timestamp for thread-reply scheduling. */
  threadTs?: string;
}

export interface ChatScheduleMessageResult {
  channel: string;
  /** Slack's id for the scheduled message — use this to cancel later. */
  scheduledMessageId: string;
  /** The post_at Slack accepted (echoes back the requested value). */
  postAt: number;
}

interface SlackResponseBody extends SlackOkResponse {
  channel?: string;
  scheduled_message_id?: string;
  post_at?: number;
}

export async function chatScheduleMessage(
  input: ChatScheduleMessageInput,
): Promise<ChatScheduleMessageResult> {
  const body: Record<string, unknown> = {
    channel: input.channel,
    text: input.text,
    post_at: input.postAt,
  };
  if (input.threadTs !== undefined) {
    body.thread_ts = input.threadTs;
  }

  const response = await slackApiRequest<SlackResponseBody>(
    "chat.scheduleMessage",
    input.botToken,
    body,
  );
  if (
    !response.channel ||
    !response.scheduled_message_id ||
    response.post_at === undefined
  ) {
    throw new SlackApiError("malformed_response");
  }
  return {
    channel: response.channel,
    scheduledMessageId: response.scheduled_message_id,
    postAt: response.post_at,
  };
}
