import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * discord:fetch_messages — read-only channel history window.
 *
 * Reads recent messages from the smoke channel. Both guildId and channelId
 * are required (no schema defaults), so each comes from env. Read-only — the
 * report asserts only the terminal run status, never message content.
 */
export default defineActionSmokeFixture({
  provider: "discord",
  action: "fetch_messages",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 10, sortOrder: "newest", filterType: "none" },
  configFromEnv: {
    guildId: "SMOKE_DISCORD_GUILD_ID",
    channelId: "SMOKE_DISCORD_CHANNEL_ID",
  },
  requiredEnv: [
    "SMOKE_DISCORD_CONNECTED",
    "SMOKE_DISCORD_GUILD_ID",
    "SMOKE_DISCORD_CHANNEL_ID",
  ],
  expect: { outcome: "success" },
  notes: "Read-only Discord message fetch (limit 10, no filter) on the smoke channel.",
});
