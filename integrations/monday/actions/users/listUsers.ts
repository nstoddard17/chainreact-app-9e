import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { usersList } from "@/integrations/_shared/monday/api/usersList";
import { ListUsersConfigSchema } from "./listUsers.schema";

/**
 * Monday `list_users` action handler — Slice 3.MONDAY-2.
 *
 * Pure read. Lists workspace users with optional `kind` filter.
 *
 * Output shape:
 *   {
 *     users: [{ userId, name, email, title, photoUrl, enabled,
 *               createdAt }],
 *     count,
 *     kind,
 *     // For symmetry with other list actions — Monday's users field
 *     // is limit-only, so hasMore/nextCursor are always false/null.
 *     hasMore: false,
 *     nextCursor: null
 *   }
 */
export const listUsers: ActionHandler = async (input) => {
  const config = ListUsersConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      usersList({
        accessToken,
        limit: config.limit,
        kind: config.kind,
      }),
  });

  const normalized = result.users.map((u) => ({
    userId: u.id,
    name: u.name ?? null,
    email: u.email ?? null,
    title: u.title ?? null,
    photoUrl: u.photo_original ?? null,
    enabled: u.enabled ?? null,
    createdAt: u.created_at ?? null,
  }));

  return {
    output: {
      users: normalized,
      count: normalized.length,
      kind: config.kind,
      hasMore: false,
      nextCursor: null,
    },
  };
};
