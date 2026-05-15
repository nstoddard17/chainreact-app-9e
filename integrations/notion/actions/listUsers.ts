import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { usersList } from "../api/users";
import { mapNotionUser } from "./getUser";
import { ListUsersConfigSchema } from "./listUsers.schema";

/**
 * Notion `list_users` action handler (Notion 2.1 Commit 2).
 *
 * Lists workspace users via `GET /v1/users`. Single-page result — no
 * auto-pagination. Workflow authors that need to walk all pages compose
 * a downstream loop on `nextCursor` + `hasMore`.
 *
 * Output shape:
 *   {
 *     users: Array<{ ...same fields as get_user output... }>,
 *     nextCursor,            // string | null — pass to next call to continue
 *     hasMore,               // boolean
 *   }
 *
 * V1 chrome NOT ported:
 *   - `total_count` field (V1 computed from `users.length` post-filter;
 *     Notion's API never returns a workspace-wide total).
 *   - `includeGuests` filter (relied on V1's broken `is_guest` heuristic).
 */
export const listUsers: ActionHandler = async (input) => {
  const config = ListUsersConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "notion",
    accountId,
    apiCall: (accessToken) =>
      usersList({
        accessToken,
        pageSize: config.pageSize,
        startCursor: config.startCursor,
      }),
  });

  return {
    output: {
      users: result.results.map(mapNotionUser),
      nextCursor: result.next_cursor,
      hasMore: result.has_more,
    },
  };
};
