import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { reactionsRemove } from "../api/reactionsRemove";
import { RemoveReactionConfigSchema } from "./removeReaction.schema";
import { normalizeReactionName } from "./normalizeReactionName";

/**
 * Slack `remove_reaction` action handler.
 *
 * Bot-token only. Removes a specific reaction the bot added to the
 * message identified by `(channel, ts, reaction)`. Slack scopes
 * removal to the token's user — the bot cannot remove reactions
 * other users added.
 *
 * V1 ships a different "remove ALL reactions the bot added" bulk
 * operation under the same name — V2 deliberately ports the simpler
 * single-reaction shape that matches Slack's reactions.remove API
 * directly.
 *
 * Output:
 *   - `channel` — echoed from input.
 *   - `ts` — echoed from input.
 *   - `reaction` — the normalized reaction name passed to Slack.
 */
export const removeReaction: ActionHandler = async (input) => {
  const config = RemoveReactionConfigSchema.parse(input.config);
  const reaction = normalizeReactionName(config.reaction);
  if (reaction.length === 0) {
    throw new Error(
      "reaction must contain an emoji name once optional surrounding colons are stripped.",
    );
  }

  const accountId =
    input.triggerEvent.provider === "slack"
      ? input.triggerEvent.accountId
      : null;

  const integration = await getActiveForExecution(input.userId, "slack", accountId);
  if (!integration) {
    throw new Error(
      accountId
        ? `No active Slack integration found for workspace ${accountId}.`
        : "No active Slack integration found for this user.",
    );
  }

  const botToken = decryptToken(integration.accessTokenEncrypted);

  await reactionsRemove({
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
