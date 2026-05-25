import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersInfo } from "../../api/usersInfo";
import { GetUserInfoConfigSchema } from "./getUserInfo.schema";

/**
 * Slack `get_user_info` action handler (Slack 2.3 Commit 4).
 *
 * Reads a single user via `users.info`. Requires the `users:read`
 * scope (promoted from optional to required in Slack 2.3 Commit 4).
 *
 * Output:
 *   - `user` — Slack's `user` object verbatim (snake_case keys);
 *     workflow authors can `{{nodeId.user.<any-field>}}`.
 *   - Convenience flat fields for common downstream cases:
 *     `id`, `name`, `real_name`, `display_name` (from profile),
 *     `is_admin`, `is_owner`, `is_bot`, `tz`, `image_192` (from
 *     profile).
 *
 * The handler does NOT project `email`. Slack 2.3 intentionally
 * does not request `users:read.email` — `user.profile.email` will
 * be `null` / absent on every bot response. Workflows that need
 * email must add `users:read.email` and acknowledge the PII surface
 * (Slack 2.3 plan §6 decision 3) — out of scope for this slice.
 */
export const getUserInfo: ActionHandler = async (input) => {
  const config = GetUserInfoConfigSchema.parse(input.config);

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
  const result = await usersInfo({ botToken, user: config.user });

  const u = result.user as Record<string, unknown>;
  const profile = u.profile as Record<string, unknown> | undefined;

  return {
    output: {
      user: result.user,
      id: u.id,
      name: u.name,
      real_name: u.real_name,
      display_name: profile?.display_name,
      is_admin: u.is_admin,
      is_owner: u.is_owner,
      is_bot: u.is_bot,
      tz: u.tz,
      image_192: profile?.image_192,
    },
  };
};
