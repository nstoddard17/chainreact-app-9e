import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:set_channel_purpose (writeSafe) — set a smoke-created channel's purpose, prove it
 * landed, then archive the channel.
 *
 *   setup    create_channel      -> `{{smokeMarker}}pp` channel. Capture { id }.
 *   execute  set_channel_purpose -> conversations.setPurpose to `{{smokeMarker}}purposeset`.
 *   verify   channel_state (SMOKE READ-BACK) -> conversations.list by id; assert `purpose`
 *            carries marker+"purposeset".
 *   cleanup  archive_channel     -> archive the channel (archived artifact; no hard delete).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "set_channel_purpose",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    channel: "{{ledger.channel.id}}",
    purpose: "{{smokeMarker}}purposeset ChainReact action-smoke",
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
        config: { name: "{{smokeMarker}}pp", isPrivate: false },
        captureResource: { resourceKey: "channel", idPath: "id", kind: "channel" },
      },
    ],
    verify: {
      provider: "slack",
      action: "channel_state",
      config: { channel: "{{ledger.channel.id}}" },
      smokeRead: true,
      markerPath: "purpose",
      markerSuffix: "purposeset",
    },
    cleanup: {
      provider: "slack",
      action: "archive_channel",
      config: { channel: "{{ledger.channel.id}}" },
    },
    cleanupKind: "archive",
  },
  notes:
    "create -> set_channel_purpose -> channel_state proves purpose carries marker+purposeset " +
    "-> archive_channel. writeSafe; archived-channel artifact.",
});
