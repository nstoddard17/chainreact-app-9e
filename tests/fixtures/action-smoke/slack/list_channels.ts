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
  expect: { outcome: "success" },
  notes: "Set SMOKE_SLACK_CONNECTED=1 only when the smoke account has a live Slack connection.",
});
