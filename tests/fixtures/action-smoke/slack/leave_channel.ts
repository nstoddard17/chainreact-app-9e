import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:leave_channel (writeSafe) — the bot leaves a smoke-created public channel it
 * is a member of, then the channel is archived.
 *
 *   setup    create_channel  -> `{{smokeMarker}}lc` public channel (bot auto-member).
 *            Capture { id }.
 *   execute  leave_channel    -> conversations.leave removes the bot.
 *   verify   channel_state (SMOKE READ-BACK) -> conversations.list by id; assert
 *            `is_member == false` (the leave echo is never trusted). A public channel
 *            stays listed after the bot leaves, so is_member flips to false.
 *   cleanup  [join_channel, archive_channel] -> conversations.archive returns
 *            `not_in_channel` once the bot has left (verified live), so the disposition
 *            REJOINS first, then archives. Both steps target the smoke-owned channel.
 *            cleanupKind "archive": on success -> archived artifact; on failure ->
 *            harmless marked artifact left (best-effort, never a gate fail).
 *
 * Scope: `channels:manage` / `groups:write` / `channels:join`.
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "leave_channel",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    channel: "{{ledger.channel.id}}",
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "slack",
        action: "create_channel",
        config: { name: "{{smokeMarker}}lc", isPrivate: false },
        captureResource: { resourceKey: "channel", idPath: "id", kind: "channel" },
      },
    ],
    verify: {
      provider: "slack",
      action: "channel_state",
      config: { channel: "{{ledger.channel.id}}" },
      smokeRead: true,
      expectEquals: { path: "is_member", value: false },
    },
    cleanupAll: [
      // conversations.archive returns not_in_channel after the bot leaves — rejoin first.
      {
        provider: "slack",
        action: "join_channel",
        config: { channel: "{{ledger.channel.id}}" },
      },
      {
        provider: "slack",
        action: "archive_channel",
        config: { channel: "{{ledger.channel.id}}" },
      },
    ],
    cleanupKind: "archive",
  },
  notes:
    "create (bot auto-member) -> leave_channel -> channel_state proves is_member==false " +
    "-> rejoin + archive_channel disposition (archive rejects a non-member with " +
    "not_in_channel). writeSafe; archived-channel artifact.",
});
