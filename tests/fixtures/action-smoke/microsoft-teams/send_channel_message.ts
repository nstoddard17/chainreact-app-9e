import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-teams:send_channel_message (sendSafe, artifact left) — post one
 * deterministic crsmoke- message to the PINNED smoke channel, then prove it
 * persisted via an INDEPENDENT per-message read.
 *
 *   execute  send_channel_message -> Graph POST to the pinned smoke team/channel
 *            (SMOKE_TEAMS_TEAM_ID / SMOKE_TEAMS_CHANNEL_ID — the same envs the
 *            certified Teams reads use). contentType "text" so the marker is
 *            byte-exact in the stored body. Graph returns the created chatMessage;
 *            capture { messageId } into ledger key "msg". markerEchoPath proves
 *            the marker round-tripped on the stored bodyContent.
 *   verify   channel_message_state (SMOKE READ-BACK) -> per-message GET; asserts
 *            the marker on the PERSISTED bodyContent (the registered
 *            list_channel_messages read is header-only by design and cannot
 *            prove content). The send echo is never trusted.
 *
 * DISPOSITION: none. Teams exposes no registered message-delete action in V2
 * (Graph soft-delete is not wired), so the marker message stays in the smoke
 * channel — a clearly-marked, ignorable artifact on the throwaway tenant
 * (slack:upload_file precedent). Scope: ChannelMessage.Send.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-teams",
  action: "send_channel_message",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    teamId: "{{env.SMOKE_TEAMS_TEAM_ID}}",
    channelId: "{{env.SMOKE_TEAMS_CHANNEL_ID}}",
    content: "{{smokeMarker}}channel message - safe to ignore",
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
    captureResource: { resourceKey: "msg", idPath: "messageId", kind: "message" },
    markerEchoPath: "bodyContent",
    verify: {
      provider: "microsoft-teams",
      action: "channel_message_state",
      config: {
        teamId: "{{env.SMOKE_TEAMS_TEAM_ID}}",
        channelId: "{{env.SMOKE_TEAMS_CHANNEL_ID}}",
        messageId: "{{ledger.msg.id}}",
      },
      smokeRead: true,
      markerPath: "bodyContent",
    },
    // No cleanup: no registered Teams message delete -> marked message artifact.
  },
  notes:
    "send_channel_message (text marker) to the pinned smoke channel -> " +
    "channel_message_state per-message read-back proves the marker on the persisted " +
    "body. sendSafe; marked message artifact left (no registered Teams delete).",
});
