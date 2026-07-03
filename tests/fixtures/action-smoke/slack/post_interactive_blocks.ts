import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:post_interactive_blocks (writeSafe) — post a minimal Block Kit message whose
 * BLOCK text carries a crsmoke- marker, prove it round-tripped via an INDEPENDENT
 * conversations.history read-back, then delete it.
 *
 *   setup    join_channel -> the bot self-joins the (public) smoke channel so it can
 *            post AND read history back (idempotent; already-joined returns ok).
 *   execute  post_interactive_blocks -> chat.postMessage with a single `section` block
 *            whose `text.text` is `{{smokeMarker}}blocks ...`. NO top-level `text`
 *            fallback, so the marker lives ONLY inside the block — a read-back hit
 *            proves the Block Kit payload actually rendered, not a notification string.
 *            Capture Slack's message { ts } into ledger key "msg".
 *   verify   get_messages -> INDEPENDENT conversations.history of the channel; assert
 *            the marker (+ "blocks" suffix) is PRESENT in the serialized `messages`
 *            (which includes each message's `blocks` array). The post echo is never
 *            trusted; the unique run marker means only THIS run's message can match.
 *   cleanup  delete_message -> chat.delete that exact (channel, ts). cleanupKind delete
 *            -> the block message is removed (0 leaked).
 *
 * Minimal VALID blocks payload (Slack requires each block to have a string `type`; the
 * schema passes the rest through and Slack validates server-side). SMOKE-OWNED
 * throughout: it only posts + deletes a message THIS run created in the smoke/test/
 * chainreact-named channel (SMOKE_SLACK_CHANNEL_ID — pinned or auto-discovered). Absent
 * it -> BLOCKED_ENV. Scope: `chat:write` (+ `channels:join` self-join, `channels:history`
 * read-back).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "post_interactive_blocks",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "{{smokeMarker}}blocks ChainReact action-smoke - safe to ignore",
        },
      },
    ],
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
    ],
    // chat.postMessage returns { channel, ts, message }; ts is Slack's message id.
    captureResource: { resourceKey: "msg", idPath: "ts", kind: "message" },
    verify: {
      provider: "slack",
      action: "get_messages",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", limit: 30 },
      markerPath: "messages",
      markerSuffix: "blocks",
    },
    cleanup: {
      provider: "slack",
      action: "delete_message",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", ts: "{{ledger.msg.id}}" },
    },
    cleanupKind: "delete",
  },
  notes:
    "join -> post_interactive_blocks (marker inside the block, no fallback text) -> " +
    "get_messages read-back proves the block marker is present -> delete_message. " +
    "writeSafe; cleaned (block message deleted, 0 leaked).",
});
