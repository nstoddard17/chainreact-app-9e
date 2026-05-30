import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { usersRetrieve, type NotionUser } from "../api/users";
import { GetUserConfigSchema } from "./getUser.schema";

/**
 * Notion `get_user` action handler (Notion 2.1 Commit 2).
 *
 * Fetches a single user via `GET /v1/users/{id}`. Output normalizes the
 * polymorphic Notion user shape (person vs bot) into stable flat fields.
 *
 * Email handling:
 *   - V1's `manageUsers` exposed `person.email` directly when Notion
 *     returned it (Notion 2022-06-28 API). V2 mirrors: `personEmail` is
 *     populated when `type === "person"` AND Notion returns a value.
 *     Otherwise `null`.
 *   - Notion's own OAuth capability scopes determine visibility — V2
 *     does NOT add a manifest scope for this. If a workspace's
 *     integration is configured without "user information including
 *     email addresses" capability, `person.email` is omitted by Notion
 *     and our output's `personEmail` is `null`.
 *
 * V1 chrome NOT ported:
 *   - `recent_activity` enrichment (best-effort search call after the
 *     retrieve). Skipped — workflow authors compose `search` downstream
 *     if they want activity.
 *   - `access_level` / `description` synthetic fields. Skipped — these
 *     were V1 inventions, not in Notion's response.
 *   - `is_guest` heuristic (email-domain inference). Skipped — V1's
 *     heuristic was workspace-name-string-matching against a placeholder
 *     `@yourworkspace.com` and never produced reliable results.
 *
 * Output shape:
 *   {
 *     userId,
 *     object,
 *     type,                  // "person" | "bot" | null
 *     name,
 *     avatarUrl,
 *     personEmail,           // string | null — populated for person users when Notion grants it
 *     botOwnerType,          // "user" | "workspace" | null — populated for bot users
 *     botOwnerUserId,        // string | null — populated when bot.owner.type === "user"
 *     botWorkspaceName,      // string | null — populated for bot users
 *   }
 */
export const getUser: ActionHandler = async (input) => {
  const config = GetUserConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "notion"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "notion",
    providerAccountId,
    apiCall: (accessToken) =>
      usersRetrieve({
        accessToken,
        userId: config.userId,
      }),
  });

  return {
    output: mapNotionUser(result),
  };
};

/**
 * Map a Notion user response into V2's stable flat output shape.
 * Exported indirectly via the action; the `listUsers` action reuses
 * this same mapping per-user via its own copy (keeps the cross-action
 * coupling explicit at the schema level rather than via a shared
 * helper module).
 */
export function mapNotionUser(user: NotionUser): Readonly<Record<string, unknown>> {
  return {
    userId: user.id,
    object: user.object,
    type: user.type ?? null,
    name: user.name ?? null,
    avatarUrl: user.avatar_url ?? null,
    personEmail: user.type === "person" ? (user.person?.email ?? null) : null,
    botOwnerType: user.type === "bot" ? (user.bot?.owner?.type ?? null) : null,
    botOwnerUserId:
      user.type === "bot" ? (user.bot?.owner?.user?.id ?? null) : null,
    botWorkspaceName:
      user.type === "bot" ? (user.bot?.workspace_name ?? null) : null,
  };
}
