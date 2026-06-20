import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-teams:list_channels — read-only channel list (metadata only).
 *
 * Lists the channels of a team. The team id comes from SMOKE_TEAMS_TEAM_ID
 * (overlaid onto config), so it SKIPs before workflow creation until
 * provided. The report asserts only the terminal run status — never channel
 * names. No message content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-teams",
  action: "list_channels",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { teamId: "SMOKE_TEAMS_TEAM_ID" },
  requiredEnv: ["SMOKE_MICROSOFT_TEAMS_CONNECTED", "SMOKE_TEAMS_TEAM_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only Teams channel list (metadata); needs a connected Teams + a team id in SMOKE_TEAMS_TEAM_ID.",
});
