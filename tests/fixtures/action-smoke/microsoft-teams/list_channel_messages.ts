import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-teams:list_channel_messages — read-only message metadata (one page).
 *
 * Lists up to 5 channel messages as HEADER-LEVEL metadata only (the action
 * never returns body/subject/sender-name). teamId + channelId come from
 * SMOKE_TEAMS_TEAM_ID / SMOKE_TEAMS_CHANNEL_ID (overlaid onto config), so it
 * SKIPs before workflow creation until provided. The report stays status-only
 * and never surfaces any message content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-teams",
  action: "list_channel_messages",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { top: 5 },
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
    "Read-only Teams channel-message metadata (one page, max 5; header-level only, no body); needs a connected Teams + a team id + a channel id. Empty channel is still a success.",
});
