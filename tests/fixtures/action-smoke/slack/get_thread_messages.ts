import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:get_thread_messages — read-only thread read (conversations.replies).
 *
 * Needs both a channel and a parent thread ts — sourced from SMOKE_SLACK_CHANNEL_ID
 * + SMOKE_SLACK_THREAD_TS. SKIPs before workflow creation when either is missing
 * (so it stays inventory/handler coverage until you provide a real thread ts).
 * Read-only — the report asserts only the terminal run status.
 */
export default defineActionSmokeFixture({
  provider: "slack",
  action: "get_thread_messages",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { channel: "SMOKE_SLACK_CHANNEL_ID", threadTs: "SMOKE_SLACK_THREAD_TS" },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID", "SMOKE_SLACK_THREAD_TS"],
  expect: { outcome: "success" },
  notes: "Read-only conversations.replies; needs a real parent thread ts in SMOKE_SLACK_THREAD_TS.",
});
