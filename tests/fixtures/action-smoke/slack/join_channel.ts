import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:join_channel (writeSafe) — prove a real NOT-member -> member transition on a
 * smoke-created public channel, then archive it.
 *
 *   setup    create_channel  -> `{{smokeMarker}}jc` public channel. Capture { id }.
 *            leave_channel    -> the bot is the channel creator (auto-member), so it
 *            first LEAVES to become a genuine non-member (otherwise join is a no-op).
 *   execute  join_channel     -> conversations.join re-adds the bot.
 *   verify   channel_state (SMOKE READ-BACK) -> conversations.list by id; assert
 *            `is_member == true` (the join echo is never trusted).
 *   cleanup  archive_channel  -> archive the channel (archived artifact; no hard delete).
 *
 * The setup leave makes this a TRUE transition, not an idempotent no-op: the bot is
 * provably out of the channel before the join under test runs. Scope: `channels:join`.
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "join_channel",
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
        config: { name: "{{smokeMarker}}jc", isPrivate: false },
        captureResource: { resourceKey: "channel", idPath: "id", kind: "channel" },
      },
      {
        provider: "slack",
        action: "leave_channel",
        config: { channel: "{{ledger.channel.id}}" },
      },
    ],
    verify: {
      provider: "slack",
      action: "channel_state",
      config: { channel: "{{ledger.channel.id}}" },
      smokeRead: true,
      expectEquals: { path: "is_member", value: true },
    },
    cleanup: {
      provider: "slack",
      action: "archive_channel",
      config: { channel: "{{ledger.channel.id}}" },
    },
    cleanupKind: "archive",
  },
  notes:
    "create -> leave (become non-member) -> join_channel -> channel_state proves " +
    "is_member==true -> archive_channel. writeSafe; archived-channel artifact.",
});
