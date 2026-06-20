import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:get_user_info — read-only single-user lookup (users.info).
 *
 * The user id comes from SMOKE_SLACK_USER_ID (overlaid onto config). Read-only;
 * the report asserts only the terminal run status, never the user object.
 */
export default defineActionSmokeFixture({
  provider: "slack",
  action: "get_user_info",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { user: "SMOKE_SLACK_USER_ID" },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_USER_ID"],
  expect: { outcome: "success" },
  notes: "Read-only users.info; needs a Slack user id (U…) in SMOKE_SLACK_USER_ID.",
});
