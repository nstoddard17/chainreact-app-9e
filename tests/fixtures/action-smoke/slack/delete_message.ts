import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:delete_message (destructiveSafe, execute IS the cleanup) — the bot deletes
 * exactly the throwaway message it just posted.
 *
 *   setup    send_channel_message -> POST one crsmoke-marked message to the smoke
 *            channel (bot-posted, so the bot can delete it). Capture { ts } into
 *            ledger key "msg" (Slack's message id).
 *   execute  delete_message       -> chat.delete on that exact (channel, ts). The
 *            execute IS the disposition (executeIsCleanup) — no separate cleanup step.
 *            The handler's echoed { channel, ts } is never trusted.
 *   verify   get_messages         -> INDEPENDENT conversations.history read of the
 *            channel; assert the run marker is ABSENT from the serialized `messages`
 *            (the just-deleted message is gone). The marker carries the unique run
 *            token, so only THIS run's message could match — a prior-run leftover or a
 *            foreign message never trips it.
 *
 * SMOKE-OWNED throughout: it only ever posts + deletes a message THIS run created, in a
 * smoke/test/chainreact-named channel the bot is a member of (SMOKE_SLACK_CHANNEL_ID —
 * pinned or auto-discovered by the live dev test; absent one -> BLOCKED_ENV, never a
 * post to a real channel). If execute fails after setup, the crsmoke- message is left in
 * the throwaway smoke channel (harmless; recoverable with a scoped crsmoke- sweep) and
 * the run is a gate failure — an honest leak, never a false pass.
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "delete_message",
  // "delete" is an obviously-destructive verb -> risk/liveRisk MUST be destructive
  // (the write harness gates via liveClass: destructiveSafe). Never liveSafe.
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
    ts: "{{ledger.msg.id}}",
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "slack",
        action: "send_channel_message",
        config: {
          channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
          text: "{{smokeMarker}}delmsg ChainReact action-smoke - safe to ignore",
        },
        // send_channel_message returns { channel, ts, message }; ts is Slack's message id.
        captureResource: { resourceKey: "msg", idPath: "ts", kind: "message" },
      },
    ],
    // The delete under test removes the smoke message -> it IS the disposition.
    executeIsCleanup: true,
    // Independent read-back: the deleted message is ABSENT from conversations.history.
    // A busy channel is not a concern here (dedicated smoke channel + unique run marker),
    // and the delete echo is never trusted.
    verify: {
      provider: "slack",
      action: "get_messages",
      config: {
        channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
        limit: 30,
      },
      expectAbsent: { path: "messages", value: "{{smokeMarker}}" },
    },
  },
  notes:
    "post crsmoke- message -> delete_message that exact ts -> get_messages read-back " +
    "proves the marker is ABSENT. executeIsCleanup (message gone -> artifact cleaned). " +
    "destructiveSafe; throwaway smoke channel (SMOKE_SLACK_CHANNEL_ID pinned/discovered).",
});
