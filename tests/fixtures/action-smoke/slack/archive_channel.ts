import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:archive_channel (destructiveSafe, execute IS the disposition) — archive a
 * smoke-created channel and prove the archived state.
 *
 *   setup    create_channel  -> `{{smokeMarker}}ar` channel. Capture { id }.
 *   execute  archive_channel -> conversations.archive (executeIsCleanup: archiving IS the
 *            terminal disposition; Slack has no hard channel delete).
 *   verify   channel_state (SMOKE READ-BACK) -> conversations.list (archived included) by id;
 *            assert `is_archived == true` (the archive echo is never trusted).
 *
 * "cleaned" here means archived (terminal), not deleted: the channel persists as an
 * archived artifact, named `crsmoke-<run>-ar` so it stays recognizable.
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "archive_channel",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    channel: "{{ledger.channel.id}}",
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "slack",
        action: "create_channel",
        config: { name: "{{smokeMarker}}ar", isPrivate: false },
        captureResource: { resourceKey: "channel", idPath: "id", kind: "channel" },
      },
    ],
    executeIsCleanup: true,
    verify: {
      provider: "slack",
      action: "channel_state",
      config: { channel: "{{ledger.channel.id}}" },
      smokeRead: true,
      expectEquals: { path: "is_archived", value: true },
    },
  },
  notes:
    "create -> archive_channel (executeIsCleanup) -> channel_state proves is_archived==true. " +
    "destructiveSafe; archived-channel artifact (no hard delete).",
});
