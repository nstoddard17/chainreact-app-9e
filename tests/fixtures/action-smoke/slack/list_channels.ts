import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:list_channels — a READ action (conversations.list; no mutation).
 *
 * Requires a connected Slack workspace to run for real, so it declares the env
 * the harness checks. Without it the run SKIPs (never fails) — the safe default
 * in an environment with no Slack credentials.
 */
export default defineActionSmokeFixture({
  provider: "slack",
  action: "list_channels",
  risk: "read",
  config: {
    kind: "public",
    limit: 50,
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED"],
  // Read-only (conversations.list) — safe to run against a real connected Slack
  // workspace in live mode. No mutation, no user-data leak in the report (we only
  // assert the run reached a terminal succeeded state, never the channel list).
  liveSafe: true,
  liveRisk: "read",
  expect: { outcome: "success" },
  notes:
    "Live-connected read fixture. Set SMOKE_SLACK_CONNECTED=1 only when the smoke " +
    "account has a live Slack connection; live mode then calls conversations.list.",
});
