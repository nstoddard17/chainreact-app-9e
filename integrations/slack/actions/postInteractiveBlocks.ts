import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { chatPostMessage } from "../api/chatPostMessage";
import { PostInteractiveBlocksConfigSchema } from "./postInteractiveBlocks.schema";

/**
 * Slack `post_interactive_blocks` action handler.
 *
 * Bot-token only. Posts a Block Kit message to the given channel via
 * `chat.postMessage`. Distinct action from `send_channel_message` —
 * separate schema keeps the text-only and blocks-rendered paths
 * honest.
 *
 * Optional `text` is passed through to Slack as the notification
 * preview / accessibility fallback. No auto-fallback string is
 * generated; V1's `"Interactive message"` silent default is
 * intentionally NOT ported (Q11 — no hidden defaults for user-visible
 * content).
 *
 * Output (matches send_channel_message for variable-reference
 * consistency):
 *   - `channel` — channel id Slack picked when caller used a name.
 *   - `ts` — Slack message id.
 *   - `message` — Slack's posted-message payload (server-resolved).
 */
export const postInteractiveBlocks: ActionHandler = async (input) => {
  const config = PostInteractiveBlocksConfigSchema.parse(input.config);

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

  const result = await chatPostMessage({
    botToken,
    channel: config.channel,
    blocks: config.blocks,
    text: config.text,
    threadTs: config.threadTs,
  });

  return {
    output: {
      channel: result.channel,
      ts: result.ts,
      message: result.message,
    },
  };
};
