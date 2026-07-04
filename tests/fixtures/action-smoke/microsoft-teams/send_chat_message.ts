import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-teams:send_chat_message (sendSafe, artifact left) — send one
 * deterministic crsmoke- message to an EXISTING chat on the throwaway tenant,
 * then prove it persisted via an INDEPENDENT per-message read.
 *
 *   target   SMOKE_TEAMS_CHAT_ID — discovered live by the dev test (GET /me/chats;
 *            pinned env wins; smoke/test-topic chat preferred, else the first
 *            chat). Batch 1 has no Chat.Create scope, so an existing chat is the
 *            only valid target; a tenant with NO chats reports BLOCKED_ENV.
 *   execute  send_chat_message -> Graph POST /chats/{id}/messages, contentType
 *            "text". Capture { messageId } into ledger key "msg". markerEchoPath
 *            proves the marker on the stored bodyContent.
 *   verify   chat_message_state (SMOKE READ-BACK) -> per-message GET of the chat
 *            message; asserts the marker on the PERSISTED body. The send echo is
 *            never trusted.
 *
 * DISPOSITION: none. No registered Teams message delete -> the marked chat
 * message stays (throwaway tenant, participants are the smoke account's own
 * test users). Scope: Chat.ReadWrite.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-teams",
  action: "send_chat_message",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    chatId: "{{env.SMOKE_TEAMS_CHAT_ID}}",
    content: "{{smokeMarker}}chat message - safe to ignore",
    contentType: "text",
  },
  requiredEnv: ["SMOKE_MICROSOFT_TEAMS_CONNECTED", "SMOKE_TEAMS_CHAT_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "sendSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "msg", idPath: "messageId", kind: "message" },
    markerEchoPath: "bodyContent",
    verify: {
      provider: "microsoft-teams",
      action: "chat_message_state",
      config: {
        chatId: "{{env.SMOKE_TEAMS_CHAT_ID}}",
        messageId: "{{ledger.msg.id}}",
      },
      smokeRead: true,
      markerPath: "bodyContent",
    },
    // No cleanup: no registered Teams message delete -> marked message artifact.
  },
  notes:
    "send_chat_message (text marker) to a discovered existing chat -> " +
    "chat_message_state per-message read-back proves the marker on the persisted " +
    "body. sendSafe; marked chat-message artifact left (no registered Teams delete).",
});
