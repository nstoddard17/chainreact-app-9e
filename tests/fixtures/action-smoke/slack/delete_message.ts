import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:delete_message — a DESTRUCTIVE action (chat.delete; irreversible).
 *
 * Classified destructive, so the harness NEVER runs it unless the operator
 * passes --include-destructive (and the env is present). The `delete` verb also
 * trips the fixtures-valid guard: a destructive-looking action marked anything
 * other than "destructive" is rejected. Intentionally NOT liveSafe — a
 * destructive action may never run in live mode (the fixtures-valid test enforces
 * destructive ⇒ not liveSafe).
 */
export default defineActionSmokeFixture({
  provider: "slack",
  action: "delete_message",
  risk: "destructive",
  liveRisk: "destructive",
  config: {
    channel: "{{trigger.payload.channel}}",
    ts: "{{trigger.payload.ts}}",
  },
  triggerEvent: {
    payload: { channel: "smoke-test", ts: "0000000000.000000" },
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL"],
  expect: { outcome: "success" },
  notes: "Only run against a throwaway message in the smoke channel.",
});
