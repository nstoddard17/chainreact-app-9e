import { decryptToken } from "@/core/encryption/tokens";
import { parseRecipients } from "@/core/integrations/parseRecipients";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsInvite } from "../../api/conversationsInvite";
import { InviteUsersToChannelConfigSchema } from "./inviteUsersToChannel.schema";

/**
 * Slack `invite_users_to_channel` action handler (Slack 2.3 Commit 3).
 *
 * Single bulk invite via conversations.invite. No pre-flight
 * conversations.join; no per-user retry fallback; no welcome
 * message. Workflow authors compose those steps explicitly
 * (Slack 2.3 plan §5.3).
 *
 * Each entry of `users` (CSV or array) is parsed via Q7's
 * parseRecipients (splits CSV, trims, drops empties, flattens mixed
 * array-of-CSV). User ids must match Slack's U-prefix shape — the
 * handler validates post-parse and rejects malformed entries.
 *
 * Output:
 *   - `channel` — Slack's updated channel object verbatim.
 *   - `users` — the resolved comma-joined string sent to Slack.
 *   - `invited_count` — number of ids sent.
 */
export const inviteUsersToChannel: ActionHandler = async (input) => {
  const config = InviteUsersToChannelConfigSchema.parse(input.config);

  const userIds = parseRecipients(config.users);
  if (userIds.length === 0) {
    throw new Error("users resolved to an empty list after parsing.");
  }
  for (const id of userIds) {
    if (!/^U[A-Z0-9]+$/.test(id)) {
      throw new Error(`Invalid Slack user id: ${id}`);
    }
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

  const usersCsv = userIds.join(",");
  const result = await conversationsInvite({
    botToken,
    channel: config.channel,
    users: usersCsv,
  });

  return {
    output: {
      channel: result.channel,
      users: usersCsv,
      invited_count: userIds.length,
    },
  };
};
