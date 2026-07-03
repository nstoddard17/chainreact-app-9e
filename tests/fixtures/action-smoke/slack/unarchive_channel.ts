import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:unarchive_channel (writeSafe) — restore a smoke-created channel that was
 * archived in setup, prove it is active again, then re-archive it as disposition.
 *
 *   setup    create_channel   -> `{{smokeMarker}}un` public channel. Capture { id }.
 *            archive_channel   -> archive it (so there is something to unarchive).
 *   execute  unarchive_channel -> conversations.unarchive restores it.
 *   verify   channel_state (SMOKE READ-BACK) -> conversations.list by id (archived
 *            included); assert `is_archived == false` (the unarchive echo is never
 *            trusted).
 *   cleanup  archive_channel   -> re-archive the channel as the terminal disposition
 *            (Slack has no hard channel delete). Deterministic archived artifact.
 *
 * Scope: `channels:manage` / `groups:write`.
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "unarchive_channel",
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
        config: { name: "{{smokeMarker}}un", isPrivate: false },
        captureResource: { resourceKey: "channel", idPath: "id", kind: "channel" },
      },
      {
        provider: "slack",
        action: "archive_channel",
        config: { channel: "{{ledger.channel.id}}" },
      },
    ],
    verify: {
      provider: "slack",
      action: "channel_state",
      config: { channel: "{{ledger.channel.id}}" },
      smokeRead: true,
      expectEquals: { path: "is_archived", value: false },
    },
    cleanup: {
      provider: "slack",
      action: "archive_channel",
      config: { channel: "{{ledger.channel.id}}" },
    },
    cleanupKind: "archive",
  },
  notes:
    "create -> archive (setup) -> unarchive_channel -> channel_state proves " +
    "is_archived==false -> archive_channel (re-archive disposition). writeSafe; " +
    "archived-channel artifact.",
});
