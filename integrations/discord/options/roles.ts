import { guildRolesList } from "@/integrations/_shared/discord/api/guilds";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { classifyDiscordResolverError } from "./_errors";

/**
 * `discord:roles` options resolver — Slice 3.DISCORD-3.
 *
 * Backs the `roleId` picker on `discord:assign_role`. Depends on the
 * parent `guildId` field.
 *
 * Behavior:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["guildId"]` — V1 field name verbatim.
 *   - Calls `GET /guilds/{guildId}/roles` (returns ALL roles; no pagination).
 *   - **Filter:**
 *       - Drops `@everyone` (id === guildId by Discord convention).
 *         This role is automatic and cannot be manually assigned.
 *       - Drops `managed: true` roles (bot integrations' auto-created
 *         roles, Server Booster role, Twitch sub roles, etc.).
 *         Discord blocks the assign-role PUT for these with 403; the
 *         resolver hides them so workflow authors never pick a role
 *         that will fail at runtime.
 *   - Maps each remaining role to `{ value: id, label: name }`.
 *   - Sorts by Discord's `position` (descending — higher position =
 *     higher in the role hierarchy = listed first), matching how
 *     Discord's own UI renders the role list.
 *   - Client-side case-insensitive substring filter on label.
 *   - Guild-deleted / bot-not-in-guild → empty items (no throw).
 *
 * **Hierarchy filtering — INTENTIONALLY DEFERRED.** Discord blocks
 * assigning a role higher than the bot's own highest role
 * (hierarchy rule). Filtering the picker to "only roles below the
 * bot's top role" requires:
 *   1. `GET /guilds/{guildId}/members/{botUserId}` — bot's member entry.
 *   2. Cross-referencing the role list with the bot's `roles[]`.
 *   3. Computing the bot's highest `position` from the role list.
 *   4. Filtering roles to those with strictly lower position.
 * This adds an API round-trip and 3-4x the resolver complexity. Per
 * Slice 3.DISCORD-1 §3 and the user's DISCORD-3 instruction
 * ("If safe and low-risk … document the limitation and leave runtime
 * enforcement in place"), the resolver leaves hierarchy enforcement
 * to Discord's API. Runtime `assign_role` handler surfaces 403 with
 * a clear message; UI documentation can warn authors. Future work:
 * upgrade to a 2-call resolver that filters by hierarchy.
 */
export const discordRolesResolver: OptionsResolver = {
  source: "discord:roles",
  provider: "discord",
  requiresIntegration: true,
  requiredDeps: ["guildId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Discord integration. Connect Discord first.",
      );
    }

    const guildId = ctx.deps.guildId;
    if (typeof guildId !== "string" || guildId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a Discord server first.",
      );
    }

    let roles;
    try {
      roles = await guildRolesList({ guildId });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      throw classifyDiscordResolverError(err, "roles");
    }

    const eligible = roles
      .filter(
        (r) =>
          typeof r.id === "string" &&
          r.id.length > 0 &&
          r.id !== guildId && // drop @everyone
          r.managed !== true && // drop integration-managed roles
          typeof r.name === "string" &&
          r.name.length > 0,
      )
      .slice()
      .sort((a, b) => (b.position ?? 0) - (a.position ?? 0));

    const mapped = eligible.map((r) => ({ value: r.id, label: r.name }));

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    return { items: filtered, hasMore: false };
  },
};
