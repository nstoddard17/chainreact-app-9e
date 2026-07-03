import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:update_message (writeSafe) — edit a smoke-owned message, prove the new text
 * landed AND the old text is gone, then delete the message.
 *
 *   setup    join_channel         -> bot self-joins the public smoke channel (idempotent)
 *            so the read-back conversations.history works.
 *   setup    send_channel_message -> POST one `{{smokeMarker}}orig` message. Capture { ts }.
 *   execute  update_message       -> chat.update the text to `{{smokeMarker}}updated`.
 *   verify   message_state (SMOKE READ-BACK) -> read THAT message via conversations.history;
 *            assert its `text` carries the marker+"updated" AND no longer contains
 *            `{{smokeMarker}}orig` (a no-op edit would still show "orig" -> fail). The
 *            handler's echoed { channel, ts } is never trusted.
 *   cleanup  delete_message       -> remove the smoke message (chat.delete).
 *
 * Smoke-owned throughout; the smoke channel is pinned/auto-discovered (never arbitrary).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "update_message",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
    ts: "{{ledger.msg.id}}",
    text: "{{smokeMarker}}updated ChainReact action-smoke - safe to ignore",
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
          text: "{{smokeMarker}}orig ChainReact action-smoke - safe to ignore",
        },
        captureResource: { resourceKey: "msg", idPath: "ts", kind: "message" },
      },
    ],
    verify: {
      provider: "slack",
      action: "message_state",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
      smokeRead: true,
      // new text present (marker + "updated") AND original text gone.
      markerPath: "text",
      markerSuffix: "updated",
      expectAbsent: { path: "text", value: "{{smokeMarker}}orig" },
    },
    cleanup: {
      provider: "slack",
      action: "delete_message",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
    },
    cleanupKind: "delete",
  },
  notes:
    "post orig -> update_message to updated -> message_state read-back proves text now " +
    "carries marker+updated AND not orig -> delete_message. writeSafe; smoke channel.",
});
