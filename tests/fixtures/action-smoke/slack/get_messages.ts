import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:get_messages — read-only channel history window (conversations.history).
 *
 * Reads the most recent messages from the dedicated smoke channel
 * (SMOKE_SLACK_CHANNEL_ID, overlaid onto config). Read-only — the report asserts
 * only the terminal run status, never message content.
 */
export default defineActionSmokeFixture({
  provider: "slack",
  action: "get_messages",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 20 },
  configFromEnv: { channel: "SMOKE_SLACK_CHANNEL_ID" },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID"],
  expect: { outcome: "success" },
  notes: "Read-only conversations.history on the smoke channel.",
});
