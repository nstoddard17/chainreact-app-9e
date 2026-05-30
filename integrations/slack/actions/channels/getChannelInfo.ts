import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsInfo } from "../../api/conversationsInfo";
import { GetChannelInfoConfigSchema } from "./getChannelInfo.schema";

/**
 * Slack `get_channel_info` action handler (Slack 2.3 Commit 2).
 *
 * Reads a single channel by id via `conversations.info`. Slack 2.3
 * covers public and private channels via `channels:read` + `groups:read`
 * (both required on the manifest after Slack 2.2). DMs / mpim work only
 * if `im:read` / `mpim:read` are granted — not required by Slack 2.3,
 * so passing a `D…` / `G…` id may fail with `missing_scope` upstream.
 * Handler surfaces Slack's error verbatim.
 *
 * Output:
 *   - `channel` — Slack's `channel` object verbatim (snake_case keys);
 *     workflow authors can `{{nodeId.channel.<any-field>}}`.
 *   - Convenience flattened fields (id, name, is_private, is_archived,
 *     num_members, topic, purpose, created) for the common downstream
 *     cases. The flattened keys remain snake_case to match Slack's
 *     payload shape — same convention as the trigger normalizer
 *     (Slack 2.1) which passes through Slack's payload verbatim.
 */
export const getChannelInfo: ActionHandler = async (input) => {
  const config = GetChannelInfoConfigSchema.parse(input.config);

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

  const result = await conversationsInfo({
    botToken,
    channel: config.channel,
  });

  const ch = result.channel as Record<string, unknown>;
  const topicValue = readNestedString(ch.topic, "value");
  const purposeValue = readNestedString(ch.purpose, "value");

  return {
    output: {
      channel: result.channel,
      id: ch.id,
      name: ch.name,
      is_private: ch.is_private,
      is_archived: ch.is_archived,
      num_members: ch.num_members,
      topic: topicValue,
      purpose: purposeValue,
      created: ch.created,
    },
  };
};

function readNestedString(
  parent: unknown,
  key: string,
): string | undefined {
  if (parent && typeof parent === "object" && key in parent) {
    const v = (parent as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}
