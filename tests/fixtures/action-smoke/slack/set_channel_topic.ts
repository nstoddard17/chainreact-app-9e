import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:set_channel_topic (writeSafe) — set a smoke-created channel's topic, prove it
 * landed, then archive the channel.
 *
 *   setup    create_channel    -> `{{smokeMarker}}tp` channel. Capture { id }.
 *   execute  set_channel_topic -> conversations.setTopic to `{{smokeMarker}}topicset`.
 *   verify   channel_state (SMOKE READ-BACK) -> conversations.list by id; assert `topic`
 *            carries marker+"topicset".
 *   cleanup  archive_channel   -> archive the channel (archived artifact; no hard delete).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "set_channel_topic",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    channel: "{{ledger.channel.id}}",
    topic: "{{smokeMarker}}topicset ChainReact action-smoke",
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
        config: { name: "{{smokeMarker}}tp", isPrivate: false },
        captureResource: { resourceKey: "channel", idPath: "id", kind: "channel" },
      },
    ],
    verify: {
      provider: "slack",
      action: "channel_state",
      config: { channel: "{{ledger.channel.id}}" },
      smokeRead: true,
      markerPath: "topic",
      markerSuffix: "topicset",
    },
    cleanup: {
      provider: "slack",
      action: "archive_channel",
      config: { channel: "{{ledger.channel.id}}" },
    },
    cleanupKind: "archive",
  },
  notes:
    "create -> set_channel_topic -> channel_state proves topic carries marker+topicset -> " +
    "archive_channel. writeSafe; archived-channel artifact.",
});
