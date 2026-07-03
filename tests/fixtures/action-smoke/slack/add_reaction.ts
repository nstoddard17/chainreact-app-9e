import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:add_reaction (writeSafe) — add an emoji reaction to a smoke-owned message,
 * prove it landed on THAT message, then delete the message.
 *
 *   setup    join_channel         -> bot self-joins the public smoke channel (idempotent).
 *   setup    send_channel_message -> POST one `crsmoke-` message. Capture { ts }.
 *   execute  add_reaction         -> reactions.add `white_check_mark` to (channel, ts).
 *   verify   message_state (SMOKE READ-BACK) -> read THAT message's `reactions` via
 *            conversations.history; assert the array CONTAINS `white_check_mark`. Reading
 *            the specific message (not a whole-window substring) is what makes the common
 *            emoji name a reliable proof. The handler echo is never trusted.
 *   cleanup  delete_message       -> remove the smoke message (also clears its reactions).
 *
 * `white_check_mark` is a standard Slack emoji (always available). Smoke-owned throughout.
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "add_reaction",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
    ts: "{{ledger.msg.id}}",
    reaction: "white_check_mark",
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
          text: "{{smokeMarker}}react ChainReact action-smoke - safe to ignore",
        },
        captureResource: { resourceKey: "msg", idPath: "ts", kind: "message" },
      },
    ],
    verify: {
      provider: "slack",
      action: "message_state",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectContains: { path: "reactions", value: "white_check_mark" },
    },
    cleanup: {
      provider: "slack",
      action: "delete_message",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
    },
    cleanupKind: "delete",
  },
  notes:
    "post -> add_reaction white_check_mark -> message_state read-back proves the message's " +
    "reactions contains it -> delete_message. writeSafe; smoke channel.",
});
