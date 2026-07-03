import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:unpin_message (writeSafe) — unpin a smoke-owned message that was pinned in setup,
 * prove the pin is gone via an INDEPENDENT read-back, then delete the message.
 *
 *   setup    join_channel         -> bot self-joins the public smoke channel (idempotent).
 *   setup    send_channel_message -> POST one `crsmoke-` message. Capture { ts }.
 *   setup    pin_message          -> pins.add so there is a pin to remove.
 *   execute  unpin_message        -> pins.remove (channel, ts). Needs `pins:write` (granted).
 *   verify   message_state (SMOKE READ-BACK) -> read THAT message via conversations.history;
 *            assert `pinned == false` (the message's `pinned_to` is gone). No `pins:read`
 *            required. The unpin echo is never trusted.
 *   cleanup  delete_message       -> remove the smoke message.
 *
 * Scope: `pins:write` (verified granted via the token's x-oauth-scopes).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "unpin_message",
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
          text: "{{smokeMarker}}unpin ChainReact action-smoke - safe to ignore",
        },
        captureResource: { resourceKey: "msg", idPath: "ts", kind: "message" },
      },
      {
        provider: "slack",
        action: "pin_message",
        config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
      },
    ],
    verify: {
      provider: "slack",
      action: "message_state",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectEquals: { path: "pinned", value: false },
    },
    cleanup: {
      provider: "slack",
      action: "delete_message",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
    },
    cleanupKind: "delete",
  },
  notes:
    "post -> pin (setup) -> unpin_message -> message_state read-back proves pinned==false " +
    "-> delete_message. writeSafe; smoke channel.",
});
