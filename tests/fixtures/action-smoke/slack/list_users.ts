import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:list_users — read-only workspace member list (users.list).
 *
 * Needs only a connected Slack workspace (no selector), so it's the lowest-
 * friction Slack live read. The report asserts only the terminal run status —
 * never the member list.
 */
export default defineActionSmokeFixture({
  provider: "slack",
  action: "list_users",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 50 },
  requiredEnv: ["SMOKE_SLACK_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only users.list; needs only SMOKE_SLACK_CONNECTED.",
});
