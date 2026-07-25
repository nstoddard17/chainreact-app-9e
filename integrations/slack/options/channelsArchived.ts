import { decryptToken } from "@/core/encryption/tokens";
import { conversationsList } from "../api/conversationsList";
import { SlackApiError, isSlackAuthError } from "../api/errors";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";

/**
 * `slack:channels_archived` options resolver — RESOLVERS-1.
 *
 * ARCHIVED-only variant of `slack:channels`, backing the channel picker on
 * `slack:unarchive_channel.channel`. The standard `slack:channels` resolver
 * lists with `exclude_archived=true`, so an archived channel can never
 * appear in it — which made the unarchive action's own target unpickable.
 * This resolver lists with `excludeArchived: false` and keeps ONLY the
 * conversations Slack marks `is_archived: true`.
 *
 * Endpoint: `conversations.list` (POST-form GET-semantics Slack Web API) —
 * https://api.slack.com/methods/conversations.list
 * Scopes: `channels:read` (public) + `groups:read` (private) — both already
 * granted in the Slack manifest; NO new scope.
 *
 * Behavior (mirrors `slack:channels` / `slack:group_dms`):
 *   - `requiresIntegration: true`; decrypts the bot token via `decryptToken`
 *     (no `refreshAndRetry` — the proactive sweep keeps rotation-enabled
 *     tokens fresh, and legacy Slack rows have nothing to refresh with;
 *     SLACK-TOKEN-ROTATION-1 residual gap, documented in the slice doc).
 *   - No `requiredDeps` — channels are workspace-scoped.
 *   - Single bounded page (`limit: 200`, same as the sibling resolver). The
 *     page mixes active + archived conversations; the archived subset is
 *     filtered locally, so a workspace whose archived channels sit beyond
 *     the first page won't list them — `hasMore` passes through the
 *     wrapper's cursor signal honestly and the meta keeps
 *     `allowManualEntry: true` as the escape hatch.
 *   - Maps each archived channel to an `OptionItem`:
 *     - `value`: Slack channel id (`C…` / `G…`) — exactly what
 *       `unarchive_channel.channel` stores.
 *     - `label`: `#<name>`; falls back to the raw id when Slack omits name.
 *     - `description`: `purpose.value` when present + non-empty (trimmed).
 *   - Drops records lacking a usable string `id`.
 *   - Client-side case-insensitive `q` substring filter over the label
 *     (`conversations.list` has no server-side query parameter).
 *
 * Error sanitization (identical to `slack:channels`):
 *   - auth/scope-class `SlackApiError` → `PROVIDER_REAUTH_REQUIRED`.
 *   - other `SlackApiError` → `PROVIDER_ERROR` with static copy.
 *   - non-Slack throws propagate → route maps to `SERVER_ERROR`.
 *   - Never logs the bot token, never echoes raw Slack bodies, never
 *     surfaces the raw Slack error code in the thrown message.
 *
 * Needs live smoke: coded against Slack's official conversations.list docs;
 * no live Slack call was possible in this session.
 */

interface SlackChannelShape {
  id?: unknown;
  name?: unknown;
  is_archived?: unknown;
  purpose?: { value?: unknown };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function extractDescription(channel: SlackChannelShape): string | undefined {
  if (!channel.purpose || typeof channel.purpose !== "object") return undefined;
  const purposeValue = (channel.purpose as { value?: unknown }).value;
  if (typeof purposeValue !== "string") return undefined;
  const trimmed = purposeValue.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const slackChannelsArchivedResolver: OptionsResolver = {
  source: "slack:channels_archived",
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
        types: "public_channel,private_channel",
        excludeArchived: false,
        limit: 200,
      });
    } catch (err) {
      if (err instanceof SlackApiError) {
        const reauth = isSlackAuthError(err.slackErrorCode);
        console.warn(
          JSON.stringify({
            event: "options.slack_channels_archived.provider_error",
            source: "slack:channels_archived",
            slackErrorClass: reauth ? "auth" : "provider",
            slackErrorCode: err.slackErrorCode,
          }),
        );
        if (reauth) {
          throw new OptionsResolverError(
            "PROVIDER_REAUTH_REQUIRED",
            "Slack needs to be reconnected before its archived channels can load.",
          );
        }
        throw new OptionsResolverError(
          "PROVIDER_ERROR",
          "Couldn't load archived Slack channels. Try again.",
        );
      }
      // Non-Slack error — surface to the route's catch-all (SERVER_ERROR).
      throw err;
    }

    const items = page.channels
      .map((raw) => {
        const channel = raw as SlackChannelShape;
        if (channel.is_archived !== true) return null;
        const id = asString(channel.id);
        if (!id) return null;
        const name = asString(channel.name);
        const label = name ? `#${name}` : id;
        const description = extractDescription(channel);
        return description !== undefined
          ? { value: id, label, description }
          : { value: id, label };
      })
      .filter(
        (item): item is { value: string; label: string; description?: string } =>
          item !== null,
      );

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
