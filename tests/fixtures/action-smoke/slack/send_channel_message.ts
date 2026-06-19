import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:send_channel_message — a WRITE action (posts a message).
 *
 * Exercises strict variable resolution: `text` pulls from the trigger payload,
 * so a real run proves the resolver → handler path, not just a static config.
 * Env-gated on both the connection and a dedicated smoke channel so it never
 * posts into a real channel by accident.
 */
export default defineActionSmokeFixture({
  provider: "slack",
  action: "send_channel_message",
  risk: "write",
  config: {
    channel: "{{trigger.payload.channel}}",
    text: "ChainReact action smoke: {{trigger.payload.text}}",
  },
  triggerEvent: {
    payload: { channel: "smoke-test", text: "hello from the smoke harness" },
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL"],
  expect: { outcome: "success" },
  notes: "Posts to the configured smoke channel only when SMOKE_SLACK_* env is set.",
});
