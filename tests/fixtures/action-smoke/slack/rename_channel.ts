import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:rename_channel (writeSafe) — rename a smoke-created channel, prove the new name
 * landed AND the old name is gone, then archive it.
 *
 *   setup    create_channel  -> `{{smokeMarker}}before` channel. Capture { id }.
 *   execute  rename_channel  -> conversations.rename to `{{smokeMarker}}after`.
 *   verify   channel_state (SMOKE READ-BACK) -> conversations.list by id; assert `name`
 *            carries marker+"after" AND no longer contains `{{smokeMarker}}before`.
 *   cleanup  archive_channel -> archive the channel (archived artifact; no hard delete).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "rename_channel",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    channel: "{{ledger.channel.id}}",
    name: "{{smokeMarker}}after",
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
        config: { name: "{{smokeMarker}}before", isPrivate: false },
        captureResource: { resourceKey: "channel", idPath: "id", kind: "channel" },
      },
    ],
    verify: {
      provider: "slack",
      action: "channel_state",
      config: { channel: "{{ledger.channel.id}}" },
      smokeRead: true,
      markerPath: "name",
      markerSuffix: "after",
      expectAbsent: { path: "name", value: "{{smokeMarker}}before" },
    },
    cleanup: {
      provider: "slack",
      action: "archive_channel",
      config: { channel: "{{ledger.channel.id}}" },
    },
    cleanupKind: "archive",
  },
  notes:
    "create before -> rename_channel to after -> channel_state proves name==marker+after and " +
    "not before -> archive_channel. writeSafe; archived-channel artifact.",
});
