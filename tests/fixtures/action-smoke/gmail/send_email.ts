import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:send_email (writeSafe) — send one deterministic crsmoke- email to the connected
 * smoke account itself, prove it landed via an INDEPENDENT read-back, then trash it.
 *
 *   execute  send_email -> users.messages.send an RFC 5322 message { to: SELF, subject:
 *            "{{smokeMarker}}send", textBody: "{{smokeMarker}}send body" }. A self-send to
 *            the smoke account's OWN inbox is a controlled smoke destination. Gmail
 *            collapses the self-send into a SINGLE message carrying ["UNREAD","SENT",
 *            "INBOX"] (verified live) and returns its { id } synchronously -- delivery is
 *            immediate, so no polling is needed. Capture { id } into ledger key "msg".
 *   verify   message_labels (SMOKE READ-BACK) -> users.messages.get by id; assert
 *            `labelIds` CONTAINS "SENT" (the message was actually sent) AND the marker is
 *            on the `subject` (it is OURS). The send echo is never trusted.
 *   cleanup  delete_email (trash) -> trashes the single self-message. Because the self-send
 *            is ONE message (SENT + INBOX combined), trashing its id cleans both the sent
 *            and inbox view (0 active copies left). cleanupKind delete -> cleaned (to
 *            Trash, recoverable ~30d).
 *
 * SELF address comes from SMOKE_GMAIL_SELF (discovered live via users.getProfile; absent
 * -> BLOCKED_ENV). Scope: `gmail.send` / `gmail.modify`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "send_email",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    to: "{{env.SMOKE_GMAIL_SELF}}",
    subject: "{{smokeMarker}}send ChainReact action-smoke - safe to ignore",
    textBody: "{{smokeMarker}}send body - safe to ignore",
  },
  requiredEnv: ["SMOKE_GMAIL_CONNECTED", "SMOKE_GMAIL_SELF"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    // send_email returns { id, threadId, to, subject, labelIds }; id is the sent message.
    captureResource: { resourceKey: "msg", idPath: "id", kind: "message" },
    verify: {
      provider: "gmail",
      action: "message_labels",
      config: { messageId: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectContains: { path: "labelIds", value: "SENT" },
      markerPath: "subject",
    },
    cleanup: {
      provider: "gmail",
      action: "delete_email",
      config: { messageId: "{{ledger.msg.id}}", deleteMode: "trash" },
    },
    cleanupKind: "delete",
  },
  notes:
    "send_email to SELF -> message_labels read-back proves labelIds contains SENT + marker " +
    "on subject -> delete_email(trash) removes the single self-message. writeSafe; cleaned " +
    "(to Trash). Self-send is one message (SENT+INBOX), delivered immediately.",
});
