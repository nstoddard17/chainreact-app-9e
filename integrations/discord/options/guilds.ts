import { botGuildsList } from "@/integrations/_shared/discord/api/guilds";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { classifyDiscordResolverError } from "./_errors";

/**
 * `discord:guilds` options resolver — Slice 3.DISCORD-3.
 *
 * Backs the `guildId` picker on all 5 Discord actions:
 * send_message, edit_message, delete_message, fetch_messages,
 * assign_role.
 *
 * Behavior:
 *   - `requiresIntegration: true` — the route enforces that the
 *     workflow author has linked a Discord identity (per Slice
 *     3.DISCORD-2's per-user integration row). The resolver itself
 *     authenticates as the global bot via `DISCORD_BOT_TOKEN`; the
 *     user-OAuth token is NOT decrypted or used.
 *   - No `requiredDeps` — guilds are the top-level picker.
 *   - Calls `GET /users/@me/guilds` (limit 200) — Discord returns the
 *     list of guilds the BOT is a member of. Workflow authors only
 *     see servers where ChainReact's bot has actually been installed,
 *     which is the correct behavior (every downstream action will
 *     401/403 against guilds the bot can't see).
 *   - Maps each guild to `{ value: id, label: name }`. No
 *     `description` field — `/users/@me/guilds` does not return
 *     member counts on a standard fetch (would require `with_counts`
 *     query param, deferred).
 *   - Client-side case-insensitive substring filter on `label`.
 *   - `hasMore` is true when Discord returned the full 200-item page;
 *     surfaces as a "refine search" hint to the picker UI.
 *
 * Why the bot's guild list (not the user's)?
 *   Workflow authors care about which guilds the workflow can ACT
 *   ON, not which guilds they're personally a member of. The bot's
 *   guild list is the actionable surface. If a workflow author needs
 *   the bot in a new guild, they re-run the connect flow on Discord
 *   (which presents the inline "Add to Server" picker per Slice
 *   3.DISCORD-2's manifest scope choice).
 */
export const discordGuildsResolver: OptionsResolver = {
  source: "discord:guilds",
  provider: "discord",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Discord integration. Connect Discord first.",
      );
    }

    let guilds;
    try {
      guilds = await botGuildsList({ limit: 200 });
    } catch (err) {
      throw classifyDiscordResolverError(err, "servers");
    }

    const mapped = guilds
      .filter((g) => typeof g.id === "string" && g.id.length > 0)
      .map((g) => ({
        value: g.id,
        label: g.name && g.name.length > 0 ? g.name : g.id,
      }));

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    return {
      items: filtered,
      hasMore: guilds.length >= 200,
    };
  },
};
