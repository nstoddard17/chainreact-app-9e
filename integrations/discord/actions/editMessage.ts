import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { DiscordApiError } from "../../_shared/discord/errors";
import { messageEdit } from "../../_shared/discord/api/messages";
import { EditMessageConfigSchema } from "./editMessage.schema";

/**
 * Discord `edit_message` action handler.
 *
 * PATCHes `/channels/{channelId}/messages/{messageId}` as the global
 * bot. Discord enforces: only the message author may edit a message,
 * so the bot can only edit messages IT originally sent — attempting
 * to edit a user's message returns 403 with code 50005 ("Cannot edit
 * a message authored by another user").
 *
 * The handler catches the 403/50005 case specifically and rethrows
 * with bot-context guidance so workflow authors understand it's a
 * platform limitation, not a configuration error. Other 403s
 * (missing channel access, etc.) pass through unchanged.
 *
 * Output shape:
 *   { messageId, channelId, content, editedTimestamp, author: { id, username, bot } }
 */
export const editMessage: ActionHandler = async (input) => {
  const config = EditMessageConfigSchema.parse(input.config);

  const integration = await getActiveForExecution(input.accountId, "discord", null);
  if (!integration) {
    throw new Error("No active Discord integration found for this user.");
  }

  try {
    const message = await messageEdit({
      channelId: config.channelId,
      messageId: config.messageId,
      content: config.content,
    });
    return {
      output: {
        messageId: message.id,
        channelId: message.channel_id,
        content: message.content,
        editedTimestamp: message.edited_timestamp ?? null,
        author: message.author
          ? {
              id: message.author.id,
              username: message.author.username ?? null,
              bot: message.author.bot === true,
            }
          : null,
      },
    };
  } catch (err) {
    if (err instanceof DiscordApiError && err.status === 403 && err.code === 50005) {
      throw new Error(
        "Discord limits message edits to the original author. ChainReact's bot can only edit messages it sent itself; user messages cannot be edited via the API.",
      );
    }
    throw err;
  }
};
