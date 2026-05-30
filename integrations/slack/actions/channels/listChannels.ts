import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { conversationsList } from "../../api/conversationsList";
import { ListChannelsConfigSchema } from "./listChannels.schema";

/**
 * Slack `list_channels` action handler (Slack 2.3 Commit 2).
 *
 * Reads one page of channels via `conversations.list`. Slack 2.3 covers
 * public and private channels (both `channels:read` and `groups:read`
 * are on the manifest after Slack 2.2). Pagination is single-page — the
 * handler does not auto-loop. Workflow authors paginate by chaining
 * another `list_channels` call with the previous response's
 * `nextCursor`.
 *
 * Output:
 *   - `channels` — Slack's `channels` array verbatim (snake_case keys).
 *   - `count` — length of `channels`. Convenience for branching.
 *   - `hasMore` — `true` when Slack indicates more pages exist.
 *   - `nextCursor` — opaque cursor for the next call; `null` at the end.
 */
export const listChannels: ActionHandler = async (input) => {
  const config = ListChannelsConfigSchema.parse(input.config);

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

  // Default: include both public and private (Slack 2.3 grants both
  // reads). Workflow authors that want a narrower window pass `kind`.
  const types = resolveTypes(config.kind ?? "both");
  // Default: exclude archived (most workflow callers want active
  // channels). Explicit false re-includes them.
  const excludeArchived = config.excludeArchived ?? true;

  const result = await conversationsList({
    botToken,
    types,
    excludeArchived,
    limit: config.limit,
    cursor: config.cursor,
  });

  return {
    output: {
      channels: result.channels,
      count: result.channels.length,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    },
  };
};

function resolveTypes(kind: "public" | "private" | "both"): string {
  switch (kind) {
    case "public":
      return "public_channel";
    case "private":
      return "private_channel";
    case "both":
      return "public_channel,private_channel";
  }
}
