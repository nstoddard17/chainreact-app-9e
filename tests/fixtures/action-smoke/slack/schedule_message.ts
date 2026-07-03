import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:schedule_message (writeSafe) — schedule a deterministic crsmoke- message far
 * enough in the future that it never delivers during the test, prove it is queued via
 * an INDEPENDENT scheduledMessages.list read-back, then cancel it as the disposition.
 *
 *   setup    join_channel  -> the bot self-joins the (public) smoke channel so it can
 *            post/schedule (idempotent; already-joined returns ok).
 *   execute  schedule_message -> chat.scheduleMessage a `{{smokeMarker}}sched` message
 *            at SMOKE_SLACK_POST_AT (a live-computed future Unix-second timestamp, ~7
 *            days out — inside Slack's 120-day window, so no `time_too_far`, and never
 *            delivered mid-test). Capture { scheduledMessageId } into ledger key "sched".
 *   verify   list_scheduled_messages -> INDEPENDENT scheduledMessages.list of the
 *            channel; assert the run marker is PRESENT in the serialized `messages`
 *            (the schedule echo is never trusted; the unique run marker means only THIS
 *            run's scheduled message can match).
 *   cleanup  cancel_scheduled_message -> chat.deleteScheduledMessage that exact id, so
 *            no scheduled message is left to ever deliver (cleanupKind delete -> gone).
 *
 * SMOKE-OWNED throughout: it only ever schedules + cancels a message THIS run created,
 * in a smoke/test/chainreact-named channel (SMOKE_SLACK_CHANNEL_ID — pinned or
 * auto-discovered by the live dev test). Absent the channel / post-at env -> BLOCKED_ENV.
 * Scope: `chat:write` (+ `channels:join` for the self-join).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "schedule_message",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
    text: "{{smokeMarker}}sched ChainReact action-smoke - safe to ignore",
    postAt: "{{env.SMOKE_SLACK_POST_AT}}",
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID", "SMOKE_SLACK_POST_AT"],
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
    captureResource: { resourceKey: "sched", idPath: "scheduledMessageId", kind: "scheduled_message" },
    verify: {
      provider: "slack",
      action: "list_scheduled_messages",
      config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}", limit: 100 },
      markerPath: "messages",
      markerSuffix: "sched",
    },
    cleanup: {
      provider: "slack",
      action: "cancel_scheduled_message",
      config: {
        channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
        scheduledMessageId: "{{ledger.sched.id}}",
      },
    },
    cleanupKind: "delete",
  },
  notes:
    "join -> schedule_message (future post_at) -> list_scheduled_messages proves the " +
    "marker is queued -> cancel_scheduled_message disposition (scheduled message gone). " +
    "writeSafe; cleaned (no delivered message, no leak).",
});
