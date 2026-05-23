import { messagesList } from "@/integrations/_shared/discord/api/messages";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { classifyDiscordResolverError } from "./_errors";
import { mapMessageToOption } from "./_messageMapping";

/**
 * `discord:messages` options resolver — Slice 3.DISCORD-3.
 *
 * Used by the future `discord:delete_message` ActionMeta for the
 * `messageIds[]` picker. Bots with the Manage Messages permission
 * can delete any message in a channel, not just their own, so this
 * resolver does NOT filter by author — distinct from
 * `discord:bot_messages` (which restricts to bot-authored messages
 * for the edit-message UI).
 *
 * Per Slice 3.DISCORD-1 §3.3 decision D-DC2: ship two resolvers
 * (this one + `discord:bot_messages`) rather than a single
 * resolver-with-flag. Mirrors HubSpot's per-object resolver
 * pattern (`hubspot:deal_pipelines` vs `hubspot:ticket_pipelines`).
 *
 * Depends on the parent `channelId` field.
 *
 * Behavior:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["channelId"]` — V1 field name verbatim.
 *   - Calls `GET /channels/{channelId}/messages?limit=100`.
 *   - Maps every message via the shared `mapMessageToOption`.
 *   - Client-side case-insensitive substring filter on label.
 *   - Channel-deleted / no-access → empty items (no throw).
 *   - `hasMore: false` — V1 doesn't paginate; this resolver surfaces
 *     the most recent 100 messages.
 */
export const discordMessagesResolver: OptionsResolver = {
  source: "discord:messages",
  provider: "discord",
  requiresIntegration: true,
  requiredDeps: ["channelId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Discord integration. Connect Discord first.",
      );
    }

    const channelId = ctx.deps.channelId;
    if (typeof channelId !== "string" || channelId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a Discord channel first.",
      );
    }

    let messages;
    try {
      messages = await messagesList({ channelId, limit: 100 });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      throw classifyDiscordResolverError(err, "messages");
    }

    const mapped = messages.map(mapMessageToOption);

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    return { items: filtered, hasMore: false };
  },
};
