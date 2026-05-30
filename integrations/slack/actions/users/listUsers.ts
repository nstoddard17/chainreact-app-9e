import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersList } from "../../api/usersList";
import { ListUsersConfigSchema } from "./listUsers.schema";

/**
 * Slack `list_users` action handler (Slack 2.3 Commit 4).
 *
 * Reads one page of workspace members via `users.list`. Requires the
 * `users:read` scope (promoted from optional to required in Slack 2.3
 * Commit 4). Pagination is single-page — workflow authors paginate by
 * chaining another `list_users` call with the previous response's
 * `nextCursor`.
 *
 * Output:
 *   - `users` — Slack's `members` array verbatim (snake_case keys).
 *     Workflow authors index into individual entries
 *     (`{{nodeId.users[0].real_name}}`).
 *   - `count` — length of `users`. Convenience for branching.
 *   - `hasMore` — `true` when Slack indicates more pages exist.
 *   - `nextCursor` — opaque cursor for the next call; `null` at end.
 *
 * As with `get_user_info`, individual user entries' `profile.email`
 * is `null` / absent because Slack 2.3 does not request
 * `users:read.email`.
 */
export const listUsers: ActionHandler = async (input) => {
  const config = ListUsersConfigSchema.parse(input.config);

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
  const result = await usersList({
    botToken,
    limit: config.limit,
    cursor: config.cursor,
  });

  return {
    output: {
      users: result.users,
      count: result.users.length,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    },
  };
};
