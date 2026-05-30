import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { reactionsAdd } from "../api/reactionsAdd";
import { AddReactionConfigSchema } from "./addReaction.schema";
import { normalizeReactionName } from "./normalizeReactionName";

/**
 * Slack `add_reaction` action handler.
 *
 * Bot-token only. Adds the given reaction emoji to the message
 * identified by `(channel, ts)`. Reaction names are normalized by
 * `normalizeReactionName` to strip optional surrounding colons —
 * skin-tone modifiers and case are preserved (see helper for the
 * contract).
 *
 * V1 auto-joined the channel on `not_in_channel`. V2 does NOT — that
 * required `channels:join` scope (deferred to Slack 2.2) and silently
 * mutated Slack state. The Slack error code is surfaced directly so
 * the workflow operator can invite the bot themselves.
 *
 * Output:
 *   - `channel` — echoed from input.
 *   - `ts` — echoed from input.
 *   - `reaction` — the normalized reaction name passed to Slack.
 */
export const addReaction: ActionHandler = async (input) => {
  const config = AddReactionConfigSchema.parse(input.config);
  const reaction = normalizeReactionName(config.reaction);
  if (reaction.length === 0) {
    throw new Error(
      "reaction must contain an emoji name once optional surrounding colons are stripped.",
    );
  }

  const accountId =
    input.triggerEvent.provider === "slack"
      ? input.triggerEvent.providerAccountId
      : null;

  const integration = await getActiveForExecution(input.accountId, "slack", accountId);
  if (!integration) {
    throw new Error(
      accountId
        ? `No active Slack integration found for workspace ${accountId}.`
        : "No active Slack integration found for this user.",
    );
  }

  const botToken = decryptToken(integration.accessTokenEncrypted);

  await reactionsAdd({
    botToken,
    channel: config.channel,
    timestamp: config.ts,
    name: reaction,
  });

  return {
    output: {
      channel: config.channel,
      ts: config.ts,
      reaction,
    },
  };
};
