import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:create_channel (writeSafe) — create a smoke-owned PUBLIC channel, prove it exists
 * with the marker name, then archive it (Slack has no hard channel delete -> archive is the
 * terminal disposition).
 *
 *   execute  create_channel -> conversations.create a `{{smokeMarker}}cc` channel. Capture
 *            { id } into ledger key "channel".
 *   verify   channel_state (SMOKE READ-BACK) -> conversations.list finds it by id; assert
 *            its `name` carries the run marker. (conversations.info is unusable — Slack
 *            rejects its JSON transport with invalid_arguments.)
 *   cleanup  archive_channel -> archive the created channel (cleanupKind "archive": persists
 *            as an archived artifact; there is no hard delete).
 *
 * Names are deterministic (`crsmoke-<run>-cc`) so archived smoke channels stay recognizable.
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "create_channel",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    name: "{{smokeMarker}}cc",
    isPrivate: false,
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "channel", idPath: "id", kind: "channel" },
    verify: {
      provider: "slack",
      action: "channel_state",
      config: { channel: "{{ledger.channel.id}}" },
      smokeRead: true,
      markerPath: "name",
    },
    cleanup: {
      provider: "slack",
      action: "archive_channel",
      config: { channel: "{{ledger.channel.id}}" },
    },
    cleanupKind: "archive",
  },
  notes:
    "create_channel crsmoke-<run>-cc -> channel_state read-back proves the marker name -> " +
    "archive_channel disposition (no hard delete). writeSafe; archived-channel artifact.",
});
