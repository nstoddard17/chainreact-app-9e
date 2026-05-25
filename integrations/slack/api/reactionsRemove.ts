import { slackApiRequest, type SlackOkResponse } from "./_request";

/**
 * Slack `reactions.remove` client.
 *
 * Removes a specific emoji reaction this bot added to a message
 * identified by `(channel, timestamp, name)`. Slack scopes
 * reactions.remove to reactions the requesting token's user added —
 * the bot cannot remove other users' reactions.
 *
 * Slack docs: https://api.slack.com/methods/reactions.remove
 *
 * V1 ships a different action under the same name ("remove ALL
 * reactions the bot added to a message") — V2 deliberately ports
 * the simpler, Slack-native single-reaction shape. The "remove all
 * mine" UX can be composed by callers chaining list + remove if
 * needed.
 *
 * Common error codes: `no_reaction`, `message_not_found`,
 * `channel_not_found`, `not_in_channel`.
 */
export interface ReactionsRemoveInput {
  botToken: string;
  channel: string;
  timestamp: string;
  name: string;
}

export async function reactionsRemove(input: ReactionsRemoveInput): Promise<void> {
  await slackApiRequest<SlackOkResponse>(
    "reactions.remove",
    input.botToken,
    {
      channel: input.channel,
      timestamp: input.timestamp,
      name: input.name,
    },
  );
}
