import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:list_scheduled_messages — read-only list of the bot's scheduled messages
 * (scheduledMessages.list).
 *
 * All config fields are optional; omitting `channel` lists workspace-wide. Needs
 * only a connected Slack workspace, so it runs in any verified Slack smoke env.
 * Read-only — no scheduling side effect; the report asserts only terminal status.
 */
export default defineActionSmokeFixture({
  provider: "slack",
  action: "list_scheduled_messages",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 20 },
  requiredEnv: ["SMOKE_SLACK_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only scheduledMessages.list; needs only SMOKE_SLACK_CONNECTED.",
});
