import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-teams:get_channel_details — read-only channel metadata.
 *
 * Returns the channel resource for a (teamId, channelId) pair. Both ids come
 * from SMOKE_TEAMS_TEAM_ID / SMOKE_TEAMS_CHANNEL_ID (overlaid onto config),
 * so it SKIPs before workflow creation until provided. The report asserts
 * only the terminal run status — never channel names or descriptions. No
 * message content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-teams",
  action: "get_channel_details",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    teamId: "SMOKE_TEAMS_TEAM_ID",
    channelId: "SMOKE_TEAMS_CHANNEL_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_TEAMS_CONNECTED",
    "SMOKE_TEAMS_TEAM_ID",
    "SMOKE_TEAMS_CHANNEL_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only Teams channel metadata; needs a connected Teams + a team id in SMOKE_TEAMS_TEAM_ID + a channel id in SMOKE_TEAMS_CHANNEL_ID.",
});
