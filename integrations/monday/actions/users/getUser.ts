import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { usersGet } from "@/integrations/_shared/monday/api/usersGet";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
import { GetUserConfigSchema } from "./getUser.schema";

/**
 * Monday `get_user` action handler — Slice 3.MONDAY-4.
 *
 * Pure read. Fetches a single Monday user by id with their account.
 * Throws NotFoundError when the user doesn't exist.
 *
 * Output:
 *   { userId, name, email, title, photoUrl, enabled, createdAt,
 *     accountId, accountName }
 */
export const getUser: ActionHandler = async (input) => {
  const config = GetUserConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const user = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      usersGet({ accessToken, userId: config.userId }),
  });

  if (user === null) {
    throw new NotFoundError(`user ${config.userId}`);
  }

  return {
    output: {
      userId: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      title: user.title ?? null,
      photoUrl: user.photo_original ?? null,
      enabled: user.enabled ?? null,
      createdAt: user.created_at ?? null,
      accountId: user.account?.id ?? null,
      accountName: user.account?.name ?? null,
    },
  };
};
