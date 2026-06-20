import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-teams:get_team_members — read-only team member list (one page).
 *
 * Returns one page of team members, bounded to a small page. The team id
 * comes from SMOKE_TEAMS_TEAM_ID (overlaid onto config), so it SKIPs before
 * workflow creation until provided. The action's output carries member
 * identities (emails/PII); the smoke report stays status-only and never
 * surfaces it. No message content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-teams",
  action: "get_team_members",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { top: 5 },
  configFromEnv: { teamId: "SMOKE_TEAMS_TEAM_ID" },
  requiredEnv: ["SMOKE_MICROSOFT_TEAMS_CONNECTED", "SMOKE_TEAMS_TEAM_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only Teams member list (one page, max 5); needs a connected Teams + a team id in SMOKE_TEAMS_TEAM_ID. Report is status-only (member PII never surfaced).",
});
