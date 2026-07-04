import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-teams:reply_to_channel_message (sendSafe, artifact left) — reply to a
 * smoke-owned parent message in the pinned smoke channel, then prove the reply
 * (content AND threading) via an INDEPENDENT reply read.
 *
 *   setup    send_channel_message -> the marker PARENT message (capture ledger
 *            key "parent").
 *   execute  reply_to_channel_message -> marker reply under that parent. Capture
 *            { messageId } into ledger key "reply". markerEchoPath proves the
 *            reply marker (+"reply" suffix distinguishes it from the parent's
 *            content, which carries the same run marker).
 *   verify   channel_message_state (SMOKE READ-BACK) -> Graph serves replies ONLY
 *            under the parent's /replies/{id} subpath, so the seam takes
 *            parentMessageId. Asserts the marker(+suffix "reply") on the
 *            PERSISTED reply body AND replyToId == the captured parent id
 *            (threading proven, not just existence).
 *
 * DISPOSITION: none. No registered Teams message delete -> parent + reply stay as
 * clearly-marked artifacts in the smoke channel. Scope: ChannelMessage.Send.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-teams",
  action: "reply_to_channel_message",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    teamId: "{{env.SMOKE_TEAMS_TEAM_ID}}",
    channelId: "{{env.SMOKE_TEAMS_CHANNEL_ID}}",
    messageId: "{{ledger.parent.id}}",
    content: "{{smokeMarker}}reply - safe to ignore",
    contentType: "text",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_TEAMS_CONNECTED",
    "SMOKE_TEAMS_TEAM_ID",
    "SMOKE_TEAMS_CHANNEL_ID",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "sendSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "microsoft-teams",
        action: "send_channel_message",
        config: {
          teamId: "{{env.SMOKE_TEAMS_TEAM_ID}}",
          channelId: "{{env.SMOKE_TEAMS_CHANNEL_ID}}",
          content: "{{smokeMarker}}parent - safe to ignore",
          contentType: "text",
        },
        captureResource: { resourceKey: "parent", idPath: "messageId", kind: "message" },
      },
    ],
    captureResource: { resourceKey: "reply", idPath: "messageId", kind: "message" },
    markerEchoPath: "bodyContent",
    verify: {
      provider: "microsoft-teams",
      action: "channel_message_state",
      config: {
        teamId: "{{env.SMOKE_TEAMS_TEAM_ID}}",
        channelId: "{{env.SMOKE_TEAMS_CHANNEL_ID}}",
        messageId: "{{ledger.reply.id}}",
        parentMessageId: "{{ledger.parent.id}}",
      },
      smokeRead: true,
      markerPath: "bodyContent",
      markerSuffix: "reply",
      expectEquals: { path: "replyToId", value: "{{ledger.parent.id}}" },
    },
    // No cleanup: no registered Teams message delete -> parent + reply artifacts.
  },
  notes:
    "send_channel_message (marker parent) -> reply_to_channel_message (marker+reply) " +
    "-> channel_message_state via the parent's /replies subpath proves the reply body " +
    "AND replyToId == parent. sendSafe; parent + reply artifacts left.",
});
