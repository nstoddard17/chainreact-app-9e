import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:get_channel_info — read-only single-channel lookup (conversations.info).
 *
 * Reuses the smoke channel id from SMOKE_SLACK_CHANNEL_ID (overlaid onto config),
 * so it runs against the same dedicated channel as the write fixture. Read-only;
 * the report asserts only the terminal run status, never the channel object.
 */
export default defineActionSmokeFixture({
  provider: "slack",
  action: "get_channel_info",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { channel: "SMOKE_SLACK_CHANNEL_ID" },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID"],
  expect: { outcome: "success" },
  notes: "Read-only conversations.info on SMOKE_SLACK_CHANNEL_ID.",
});
