import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { messageCreate } from "../../_shared/discord/api/messages";
import { SendMessageConfigSchema } from "./sendMessage.schema";

/**
 * Discord `send_message` action handler.
 *
 * POSTs `/channels/{channelId}/messages` as the global bot
 * (`DISCORD_BOT_TOKEN`). The integration row is looked up only as an
 * access gate — the user must have linked their Discord identity for
 * the action to fire. The user's OAuth token is NOT used (Discord's
 * bot model uses one global token for all API calls; the user-OAuth
 * token only proves identity).
 *
 * **Why look up the integration at all if the bot token does the
 * work?** Three reasons:
 *   1. Authorization gate — a user with no Discord integration row
 *      should not be able to trigger Discord-side effects in their
 *      workflows. We surface a typed "no integration" error instead
 *      of silently running the action as if the user had connected.
 *   2. Consistency with every other V2 provider's handler shape.
 *   3. Future-proof: when triggers and dynamic resolvers ship, they
 *      will need the integration row + user-OAuth token. The gate
 *      stays in place rather than being added back later.
 *
 * Output shape:
 *   { messageId, channelId, guildId, content, timestamp, author: { id, username, bot } }
 *
 * `author` carries the bot's identity (Discord echoes it back on the
 * POST response). Useful for downstream nodes that need to reply or
 * react to the bot's own message.
 */
export const sendMessage: ActionHandler = async (input) => {
  const config = SendMessageConfigSchema.parse(input.config);

  const integration = await getActiveForExecution(input.accountId, "discord", null);
  if (!integration) {
    throw new Error("No active Discord integration found for this user.");
  }

  const message = await messageCreate({
    channelId: config.channelId,
    content: config.message,
  });

  return {
    output: {
      messageId: message.id,
      channelId: message.channel_id,
      guildId: config.guildId,
      content: message.content,
      timestamp: message.timestamp ?? new Date().toISOString(),
      author: message.author
        ? {
            id: message.author.id,
            username: message.author.username ?? null,
            bot: message.author.bot === true,
          }
        : null,
    },
  };
};
