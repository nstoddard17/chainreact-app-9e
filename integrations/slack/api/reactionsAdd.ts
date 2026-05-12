import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `reactions.add` client.
 *
 * Adds an emoji reaction to a specific message identified by
 * `(channel, timestamp)`. The reaction name is passed as Slack expects
 * it (no surrounding colons; case-sensitive).
 *
 * Slack docs: https://api.slack.com/methods/reactions.add
 *
 * Slack returns only `{ ok: true }` on success — no useful body.
 * Common error codes: `already_reacted`, `invalid_name`,
 * `message_not_found`, `channel_not_found`, `not_in_channel`,
 * `too_many_emoji`, `too_many_reactions`.
 *
 * V2 does NOT auto-join the channel on `not_in_channel` (V1's
 * fallback). That behavior silently mutates the user's Slack state
 * and would require `channels:join` scope (deferred to Slack 2.2).
 * V2 surfaces the Slack error code directly via SlackApiError.
 */
export interface ReactionsAddInput {
  botToken: string;
  /** Channel id (`C…`, `D…`, `G…`). */
  channel: string;
  /** Slack message timestamp. */
  timestamp: string;
  /** Slack reaction name (no surrounding colons). */
  name: string;
}

export async function reactionsAdd(input: ReactionsAddInput): Promise<void> {
  await slackApiRequest<SlackOkResponse>(
    "reactions.add",
    input.botToken,
    {
      channel: input.channel,
      timestamp: input.timestamp,
      name: input.name,
    },
  );
}
