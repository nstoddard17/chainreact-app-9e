import { decryptToken } from "@/core/encryption/tokens";
import { conversationsList } from "../api/conversationsList";
import { SlackApiError, isSlackAuthError } from "../api/errors";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";

/**
 * `slack:group_dms` options resolver (CONFIG-FIELD-UX-SWEEP-4, Marcus-approved
 * pre-launch `mpim:read` scope add).
 *
 * Backs the group-DM (mpim) `channelId` field on the
 * `new_group_direct_message` trigger. Group DMs are NOT public/private channels,
 * so `slack:channels` (which lists `public_channel,private_channel`) cannot
 * surface them — this resolver lists `types: "mpim"` instead.
 *
 * Mirrors `slack:channels`:
 *   - `requiresIntegration: true`; decrypts the bot token via `decryptToken`
 *     (no `refreshAndRetry` — the proactive sweep keeps rotation-enabled
 *     tokens fresh, and legacy Slack rows have nothing to refresh with;
 *     SLACK-TOKEN-ROTATION-1 residual gap, documented in the slice doc).
 *   - No `requiredDeps` — group DMs are workspace-scoped.
 *   - Maps each mpim to `{value: id, label: name}`:
 *     - `value`: the Slack conversation id (`G…`) — exactly what the trigger
 *       filter stores.
 *     - `label`: Slack's own conversation `name` (e.g. `mpdm-amy--bo--cy-1`) —
 *       the same display string Slack shows in its UI. Falls back to the id.
 *       We do NOT expand the `members` array (that would require user lookups +
 *       risk surfacing more than the conversation name).
 *   - Client-side `q` substring filter (Slack has no server-side query).
 *
 * SCOPE / RECONNECT: `conversations.list types=mpim` requires `mpim:read`, ADDED
 * to the manifest in this slice. A token that predates it returns Slack
 * `missing_scope` → `SlackApiError` → `isSlackAuthError` true →
 * `PROVIDER_REAUTH_REQUIRED` (the same Reconnect UX `slack:channels` already
 * produces). The field keeps a manual-id fallback meanwhile.
 *
 * No-leak: never logs the bot token, never echoes raw Slack bodies, never
 * surfaces the raw Slack error code in the thrown message.
 */

interface SlackMpimShape {
  id?: unknown;
  name?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const slackGroupDmsResolver: OptionsResolver = {
  source: "slack:group_dms",
  provider: "slack",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Slack integration. Connect Slack first.",
      );
    }
    const botToken = decryptToken(ctx.integration.accessTokenEncrypted);

    let page;
    try {
      page = await conversationsList({
        botToken,
        types: "mpim",
        excludeArchived: true,
        limit: 200,
      });
    } catch (err) {
      if (err instanceof SlackApiError) {
        const reauth = isSlackAuthError(err.slackErrorCode);
        console.warn(
          JSON.stringify({
            event: "options.slack_group_dms.provider_error",
            source: "slack:group_dms",
            slackErrorClass: reauth ? "auth" : "provider",
            slackErrorCode: err.slackErrorCode,
          }),
        );
        if (reauth) {
          throw new OptionsResolverError(
            "PROVIDER_REAUTH_REQUIRED",
            "Slack needs to be reconnected before its group DMs can load.",
          );
        }
        throw new OptionsResolverError(
          "PROVIDER_ERROR",
          "Couldn't load Slack group DMs. Try again.",
        );
      }
      throw err;
    }

    const items = page.channels
      .map((raw) => {
        const mpim = raw as SlackMpimShape;
        const id = asString(mpim.id);
        if (!id) return null;
        const name = asString(mpim.name);
        return { value: id, label: name ?? id };
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
