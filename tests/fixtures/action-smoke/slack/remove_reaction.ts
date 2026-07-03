import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:remove_reaction (writeSafe) — remove an emoji reaction the bot added to a
 * smoke-owned message, prove it is gone from THAT message, then delete the message.
 *
 *   setup    join_channel         -> bot self-joins the public smoke channel (idempotent).
 *   setup    send_channel_message -> POST one `crsmoke-` message. Capture { ts }.
 *   setup    add_reaction         -> reactions.add `white_check_mark` (so there is one to
 *            remove; the bot can only remove reactions it added).
 *   execute  remove_reaction      -> reactions.remove `white_check_mark` from (channel, ts).
 *   verify   message_state (SMOKE READ-BACK) -> read THAT message's `reactions` via
 *            conversations.history; assert the array NO LONGER contains `white_check_mark`.
 *            The handler echo is never trusted.
 *   cleanup  delete_message       -> remove the smoke message.
 *
 * Smoke-owned throughout; the smoke channel is pinned/auto-discovered (never arbitrary).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "remove_reaction",
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
          text: "{{smokeMarker}}unreact ChainReact action-smoke - safe to ignore",
        },
        captureResource: { resourceKey: "msg", idPath: "ts", kind: "message" },
      },
      {
        provider: "slack",
        action: "add_reaction",
        config: {
          channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
          ts: "{{ledger.msg.id}}",
          reaction: "white_check_mark",
        },
      },
    ],
    verify: {
      provider: "slack",
      action: "message_state",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectAbsent: { path: "reactions", value: "white_check_mark" },
    },
    cleanup: {
      provider: "slack",
      action: "delete_message",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
    },
    cleanupKind: "delete",
  },
  notes:
    "post -> add_reaction (setup) -> remove_reaction -> message_state read-back proves the " +
    "message's reactions no longer contains it -> delete_message. writeSafe; smoke channel.",
});
