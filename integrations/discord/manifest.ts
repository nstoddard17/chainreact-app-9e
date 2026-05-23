import { ProviderManifestSchema, type ProviderManifest } from "@/contracts/integration";

/**
 * Discord provider manifest — Slice 3.DISCORD-2 (runtime port).
 *
 * **Architectural note — bot-token vs user-OAuth duality.**
 *
 * Discord differs from every prior V2 provider on the auth model. There
 * are TWO separate tokens involved:
 *
 *   1. **User OAuth token** (per-user, captured at connect time, stored
 *      encrypted on the `integrations` row). Established via Discord's
 *      OAuth2 authorize flow. Identifies WHICH ChainReact user has
 *      linked their Discord identity. NOT used for action API calls.
 *
 *   2. **Global bot token** (deployment-wide, sourced from
 *      `DISCORD_BOT_TOKEN` env). Identifies the ChainReact bot
 *      application. Users add THAT bot to their guilds via Discord's
 *      "Add to Server" picker (presented inline during the OAuth flow
 *      when the `bot` scope is requested). All 5 V2 action handlers
 *      authenticate as the bot — they read the token from env and call
 *      Discord directly. The bot's permissions in any given guild are
 *      enforced by Discord's own per-guild role/permission model.
 *
 * The manifest declares `tokenScope: "user"` because the integration
 * row is per-user (the user-OAuth token is what we persist). The bot
 * token is intentionally NOT modeled by the manifest — it's a
 * deployment-level secret, not a per-integration credential.
 *
 * **Refreshable.** Discord's OAuth2 returns refresh tokens for user
 * identity flows; the user OAuth token expires after ~7 days and
 * `oauth.ts:refreshToken` calls Discord's `/oauth2/token` with
 * `grant_type=refresh_token`. The bot token does NOT refresh (it's
 * static — operator rotates the env var).
 *
 * **Scopes.**
 *   - `identify` — read user's id / username for the integration row
 *     display name. Required for the OAuth callback's `users/@me`
 *     lookup.
 *   - `email` — read user's email (surfaced in account metadata).
 *   - `bot` — triggers Discord's inline "Add to Server" picker during
 *     OAuth. Without this scope, the user authorizes identity only;
 *     the bot is never invited to any guild and action handlers will
 *     hit 403/Missing Access for every call.
 *   - `guilds` — read the user's guild list. Required for the future
 *     `discord:guilds` options resolver (DISCORD-3).
 *
 * **Bot install is a side-effect of the OAuth flow** when `bot` is in
 * scopes. Discord's authorize page shows the server picker; the user
 * selects a guild; Discord installs the global bot to that guild and
 * sets bot permissions per the `permissions` URL param. ChainReact
 * receives the OAuth callback for the user-identity portion; the bot
 * install completes server-side at Discord.
 *
 * **Health check interval.** 4h — same cadence as Slack / GitHub /
 * Notion per CLAUDE.md V1 health-check intervals.
 *
 * **Capabilities.**
 *   - OAuth: true.
 *   - Actions: true — 5 handlers (DISCORD-2: `services/execution/handlers/_registry.ts`).
 *   - Webhook trigger: true — `discord:slash_command` ships in DISCORD-6
 *     via Discord's Interactions Endpoint URL (Ed25519-signed HTTP POST).
 *     `discord:new_message` (polling) and `discord:member_join` are
 *     scoped to follow-up slices per
 *     `docs/slices/phase-3/discord-trigger-architecture-plan.md`.
 *   - Polling trigger: false — `discord:new_message` polling lands in
 *     DISCORD-7. The capability flag flips when that slice ships.
 *
 * The action keys ship at:
 *   - `discord:send_message`
 *   - `discord:edit_message`
 *   - `discord:delete_message` (destructive bulk supported)
 *   - `discord:fetch_messages` (read-only)
 *   - `discord:assign_role`
 */
export const discordManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "discord",
  displayName: "Discord",
  isEnabled: true,
  apiVersion: "v10",
  tokenScope: "user",
  oauthFlows: ["v2"],
  scopes: {
    required: [
      "identify",
      "email",
      // `bot` triggers Discord's inline server picker so the global bot
      // gets installed to a guild as part of the same OAuth flow. Action
      // handlers authenticate as the bot (env DISCORD_BOT_TOKEN); without
      // a guild install the bot has no access to any of the user's
      // servers and every action call returns 403 / Missing Access.
      "bot",
      // `guilds` powers the future discord:guilds options resolver
      // (DISCORD-3). Harmless to grant now — Discord shows it on the
      // consent screen as "see your servers".
      "guilds",
    ],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    webhookTrigger: true,
    pollingTrigger: false,
    actions: true,
  },
  healthCheckIntervalMs: 4 * 60 * 60 * 1000,
  refreshable: true,
});
