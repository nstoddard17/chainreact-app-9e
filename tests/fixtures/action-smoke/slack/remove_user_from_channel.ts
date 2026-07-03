import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:remove_user_from_channel (writeSafe) — remove a REAL throwaway-workspace user
 * that was invited in setup from a smoke-created public channel, prove the removal,
 * then archive the channel.
 *
 *   setup    create_channel  -> `{{smokeMarker}}rm` public channel. Capture { id }.
 *            invite_users_to_channel -> add the discovered smoke user
 *            (SMOKE_SLACK_INVITE_USER_ID) so there is a member to remove.
 *   execute  remove_user_from_channel -> conversations.kick the invited user.
 *   verify   channel_members (SMOKE READ-BACK) -> conversations.members by channel id;
 *            assert the members array NO LONGER contains the removed user id (the kick
 *            echo is never trusted). The bot itself stays a member.
 *   cleanup  archive_channel -> archive the channel (archived artifact; no hard delete).
 *
 * The user id is a REAL member of the throwaway workspace discovered from users.list
 * (never invented, never Slackbot, never a bot). If no eligible human exists,
 * SMOKE_SLACK_INVITE_USER_ID is unset -> the fixture reports BLOCKED_ENV.
 * Scope: `channels:manage` / `groups:write`.
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "remove_user_from_channel",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    channel: "{{ledger.channel.id}}",
    user: "{{env.SMOKE_SLACK_INVITE_USER_ID}}",
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
        config: { name: "{{smokeMarker}}rm", isPrivate: false },
        captureResource: { resourceKey: "channel", idPath: "id", kind: "channel" },
      },
      {
        provider: "slack",
        action: "invite_users_to_channel",
        config: {
          channel: "{{ledger.channel.id}}",
          users: "{{env.SMOKE_SLACK_INVITE_USER_ID}}",
          sendInviteNotification: true,
        },
      },
    ],
    verify: {
      provider: "slack",
      action: "channel_members",
      config: { channel: "{{ledger.channel.id}}" },
      smokeRead: true,
      expectAbsent: { path: "members", value: "{{env.SMOKE_SLACK_INVITE_USER_ID}}" },
    },
    cleanup: {
      provider: "slack",
      action: "archive_channel",
      config: { channel: "{{ledger.channel.id}}" },
    },
    cleanupKind: "archive",
  },
  notes:
    "create -> invite (real discovered smoke user) -> remove_user_from_channel -> " +
    "channel_members proves members no longer contains the removed id -> archive_channel. " +
    "writeSafe; archived-channel artifact.",
});
