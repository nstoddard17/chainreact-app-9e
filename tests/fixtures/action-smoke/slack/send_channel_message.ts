import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:send_channel_message — the first low-risk LIVE WRITE fixture.
 *
 * Posts a clearly-marked, ignorable smoke message to a dedicated channel. The
 * target channel comes from SMOKE_SLACK_CHANNEL_ID (never a hardcoded literal),
 * overlaid onto config at run time. The text carries a per-run marker
 * (`{{trigger.eventId}}` — the engine resolves it to the run's unique event id).
 *
 * Gating (workflow-live mode):
 *   - liveSafe + liveRisk "write" → needs ALLOW_LIVE_PROVIDER_SMOKE AND
 *     ALLOW_LIVE_PROVIDER_WRITE_SMOKE,
 *   - SKIPs before any workflow is created if SMOKE_SLACK_CONNECTED or
 *     SMOKE_SLACK_CHANNEL_ID is missing.
 *
 * This slice intentionally does NOT delete the posted message (no destructive
 * cleanup). Use a dedicated PRIVATE smoke channel.
 */
export default defineActionSmokeFixture({
  provider: "slack",
  action: "send_channel_message",
  risk: "write",
  liveSafe: true,
  liveRisk: "write",
  config: {
    text: "ChainReact action-smoke LIVE write test — safe to ignore (run {{trigger.eventId}})",
  },
  configFromEnv: { channel: "SMOKE_SLACK_CHANNEL_ID" },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID"],
  expect: { outcome: "success" },
  notes:
    "LIVE WRITE — posts a real Slack message to SMOKE_SLACK_CHANNEL_ID. Requires " +
    "ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true. Point it at a throwaway private smoke channel.",
});
