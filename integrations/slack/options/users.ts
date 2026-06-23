import { decryptToken } from "@/core/encryption/tokens";
import { usersList } from "../api/usersList";
import { SlackApiError, isSlackAuthError } from "../api/errors";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";

/**
 * `slack:users` options resolver (CONFIG-FIELD-UX-SWEEP).
 *
 * Backs the user picker on single-value Slack user-id fields
 * (`send_direct_message.userId`, `get_user_info.user`,
 * `remove_user_from_channel.user`, and the `new_direct_message.withUserId`
 * sender filter). Mirrors `slack:channels` (Slice 3.32) exactly:
 *
 *   - `requiresIntegration: true` — the route loads an active Slack
 *     integration row before invocation; the resolver decrypts the bot
 *     token via the same `decryptToken` path as the Slack runtime handlers.
 *   - No `requiredDeps` — workspace members are workspace-scoped.
 *   - Calls `users.list` (scope `users:read`, already in the manifest's
 *     required set) for a single bounded page (limit 200). Slack's
 *     `users.list` has no server-side query param, so `q` filtering is
 *     client-side over the rendered label.
 *   - Maps each member to `{ value: <user id 'U…'>, label: '@<name>' }`.
 *     Display name resolves `profile.display_name → profile.real_name →
 *     real_name → name`; name-less members fall back to the raw id.
 *
 * No-leak: V2 intentionally does NOT request `users:read.email`
 * (manifest note), so `profile.email` is absent. This resolver reads ONLY
 * the id + display name — never email/phone/title — so it surfaces the
 * same data class as the `slack:channels` picker (`#name`). Deleted
 * members are dropped (not valid DM/lookup targets).
 *
 * Error sanitization is identical to `slack:channels`: a logical Slack
 * `SlackApiError` is re-thrown as `OptionsResolverError` with a
 * caller-friendly message (the raw Slack error code + bot token never
 * reach the client); anything else propagates to the route's SERVER_ERROR
 * catch-all.
 */

interface SlackUserShape {
  id?: unknown;
  name?: unknown;
  real_name?: unknown;
  deleted?: unknown;
  profile?: { display_name?: unknown; real_name?: unknown };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function resolveDisplayName(user: SlackUserShape): string | null {
  const profile =
    user.profile && typeof user.profile === "object"
      ? (user.profile as { display_name?: unknown; real_name?: unknown })
      : {};
  return (
    asString(profile.display_name) ??
    asString(profile.real_name) ??
    asString(user.real_name) ??
    asString(user.name)
  );
}

export const slackUsersResolver: OptionsResolver = {
  source: "slack:users",
  provider: "slack",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      // Defensive — the route short-circuits with INTEGRATION_DISCONNECTED
      // before dispatch; classified the same way the route would.
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Slack integration. Connect Slack first.",
      );
    }
    const botToken = decryptToken(ctx.integration.accessTokenEncrypted);

    let page;
    try {
      page = await usersList({ botToken, limit: 200 });
    } catch (err) {
      if (err instanceof SlackApiError) {
        const reauth = isSlackAuthError(err.slackErrorCode);
        console.warn(
          JSON.stringify({
            event: "options.slack_users.provider_error",
            source: "slack:users",
            slackErrorClass: reauth ? "auth" : "provider",
            slackErrorCode: err.slackErrorCode,
          }),
        );
        if (reauth) {
          throw new OptionsResolverError(
            "PROVIDER_REAUTH_REQUIRED",
            "Slack needs to be reconnected before its users can load.",
          );
        }
        throw new OptionsResolverError(
          "PROVIDER_ERROR",
          "Couldn't load Slack users. Try again.",
        );
      }
      throw err;
    }

    const items = page.users
      .map((raw) => {
        const user = raw as SlackUserShape;
        const id = asString(user.id);
        if (!id) return null;
        if (user.deleted === true) return null;
        const name = resolveDisplayName(user);
        const label = name ? `@${name}` : id;
        return { value: id, label };
      })
      .filter((item): item is { value: string; label: string } => item !== null);

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return {
      items: filtered,
      hasMore: page.hasMore,
    };
  },
};
