import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:pin_message (writeSafe) — pin a smoke-owned message, prove the pin landed on THAT
 * message via an INDEPENDENT read-back, then delete the message.
 *
 *   setup    join_channel         -> bot self-joins the public smoke channel (idempotent).
 *   setup    send_channel_message -> POST one `crsmoke-` message. Capture { ts }.
 *   execute  pin_message          -> pins.add (channel, ts). Needs `pins:write` (granted).
 *   verify   message_state (SMOKE READ-BACK) -> read THAT message via conversations.history;
 *            assert `pinned == true`. `pinned` is derived from Slack's `pinned_to` array,
 *            which history returns under the granted `channels:history` scope -- so NO
 *            `pins:read` is required (pins.list is unavailable without it). The pin echo is
 *            never trusted.
 *   cleanup  delete_message       -> remove the smoke message (deleting it also removes the
 *            pin, so no pinned artifact can survive).
 *
 * Scope: `pins:write` (verified granted via the token's x-oauth-scopes).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "pin_message",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
    ts: "{{ledger.msg.id}}",
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "slack",
        action: "join_channel",
        config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}" },
      },
      {
        provider: "slack",
        action: "send_channel_message",
        config: {
          channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
          text: "{{smokeMarker}}pin ChainReact action-smoke - safe to ignore",
        },
        captureResource: { resourceKey: "msg", idPath: "ts", kind: "message" },
      },
    ],
    verify: {
      provider: "slack",
      action: "message_state",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectEquals: { path: "pinned", value: true },
    },
    cleanup: {
      provider: "slack",
      action: "delete_message",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
    },
    cleanupKind: "delete",
  },
  notes:
    "post -> pin_message -> message_state read-back proves pinned==true (via pinned_to, no " +
    "pins:read needed) -> delete_message. writeSafe; smoke channel.",
});
