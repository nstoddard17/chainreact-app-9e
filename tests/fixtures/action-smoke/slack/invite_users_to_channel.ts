import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:invite_users_to_channel (writeSafe) — invite a REAL throwaway-workspace user
 * to a smoke-created public channel, prove the membership, then archive the channel.
 *
 *   setup    create_channel  -> `{{smokeMarker}}iv` public channel. Capture { id }.
 *   execute  invite_users_to_channel -> conversations.invite the discovered smoke user
 *            (SMOKE_SLACK_INVITE_USER_ID). `sendInviteNotification: true` is the
 *            explicit Q11 acknowledgement (Slack always notifies invitees).
 *   verify   channel_members (SMOKE READ-BACK) -> conversations.members by channel id;
 *            assert the members array CONTAINS the invited user id (exact element
 *            match; the invite echo is never trusted).
 *   cleanup  archive_channel -> archive the channel (archived artifact; no hard delete).
 *
 * The invited user id is a REAL member of the throwaway workspace discovered from
 * users.list (never invented, never Slackbot, never a bot). If no eligible human
 * exists, SMOKE_SLACK_INVITE_USER_ID is unset -> the fixture reports BLOCKED_ENV.
 * Scope: `channels:manage` / `groups:write`.
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "invite_users_to_channel",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    channel: "{{ledger.channel.id}}",
    users: "{{env.SMOKE_SLACK_INVITE_USER_ID}}",
    sendInviteNotification: true,
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID", "SMOKE_SLACK_INVITE_USER_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "slack",
        action: "create_channel",
        config: { name: "{{smokeMarker}}iv", isPrivate: false },
        captureResource: { resourceKey: "channel", idPath: "id", kind: "channel" },
      },
    ],
    verify: {
      provider: "slack",
      action: "channel_members",
      config: { channel: "{{ledger.channel.id}}" },
      smokeRead: true,
      expectContains: { path: "members", value: "{{env.SMOKE_SLACK_INVITE_USER_ID}}" },
    },
    cleanup: {
      provider: "slack",
      action: "archive_channel",
      config: { channel: "{{ledger.channel.id}}" },
    },
    cleanupKind: "archive",
  },
  notes:
    "create -> invite_users_to_channel (real discovered smoke user) -> channel_members " +
    "proves members contains the invited id -> archive_channel. writeSafe; " +
    "archived-channel artifact.",
});
