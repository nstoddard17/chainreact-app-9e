import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-teams:list_teams — read-only joined-teams list (metadata only).
 *
 * Lists the teams the connected account belongs to. Needs only a connected
 * Teams account; no selectors. The report asserts only the terminal run
 * status — never team names. No message content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-teams",
  action: "list_teams",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  requiredEnv: ["SMOKE_MICROSOFT_TEAMS_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Teams list (metadata); needs only SMOKE_MICROSOFT_TEAMS_CONNECTED.",
});
