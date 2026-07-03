import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:cancel_scheduled_message (destructiveSafe, execute IS the disposition) — cancel
 * a scheduled message this run created, then prove it is gone via an INDEPENDENT
 * scheduledMessages.list read-back.
 *
 *   setup    join_channel     -> the bot self-joins the (public) smoke channel so it can
 *            schedule (idempotent).
 *   setup    schedule_message -> chat.scheduleMessage a `{{smokeMarker}}cancel` message
 *            at SMOKE_SLACK_POST_AT (a live-computed future Unix-second timestamp, ~7
 *            days out — never delivered). Capture { scheduledMessageId } into "sched".
 *   execute  cancel_scheduled_message -> chat.deleteScheduledMessage that exact id. The
 *            execute IS the disposition (executeIsCleanup) — no separate cleanup.
 *   verify   list_scheduled_messages -> INDEPENDENT scheduledMessages.list of the
 *            channel; assert the run marker is ABSENT from the serialized `messages`
 *            (the cancel echo is never trusted; unique run marker -> only THIS run's
 *            message could match).
 *
 * SMOKE-OWNED throughout: it only ever schedules + cancels a message THIS run created.
 * If execute fails after setup, the scheduled crsmoke- message is left (harmless; it
 * still cancels on a future scoped sweep, or delivers a clearly-marked ignorable message)
 * and the run is a gate failure — an honest leak, never a false pass.
 * Scope: `chat:write` (+ `channels:join` for the self-join).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "cancel_scheduled_message",
  // "cancel" removes a pending side effect -> destructive verb; gated via
  // liveClass destructiveSafe (mirrors slack:delete_message). Never liveSafe.
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
    scheduledMessageId: "{{ledger.sched.id}}",
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID", "SMOKE_SLACK_POST_AT"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "slack",
        action: "join_channel",
        config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}" },
      },
      {
        provider: "slack",
        action: "schedule_message",
        config: {
          channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
          text: "{{smokeMarker}}cancel ChainReact action-smoke - safe to ignore",
          postAt: "{{env.SMOKE_SLACK_POST_AT}}",
        },
        captureResource: { resourceKey: "sched", idPath: "scheduledMessageId", kind: "scheduled_message" },
      },
    ],
    // The cancel under test removes the scheduled message -> it IS the disposition.
    executeIsCleanup: true,
    verify: {
      provider: "slack",
      action: "list_scheduled_messages",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", limit: 100 },
      expectAbsent: { path: "messages", value: "{{smokeMarker}}" },
    },
  },
  notes:
    "join -> schedule_message (capture id) -> cancel_scheduled_message that exact id -> " +
    "list_scheduled_messages read-back proves the marker is ABSENT. executeIsCleanup " +
    "(scheduled message gone -> artifact cleaned). destructiveSafe.",
});
