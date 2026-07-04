import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:reply_to_email (writeSafe) — reply to a self-sent smoke seed message, prove the
 * reply is SENT in the SAME thread and carries the marker, then trash both messages.
 *
 *   setup    send_email -> self-send a `{{smokeMarker}}replyseed` seed (the message to
 *            reply to). A first message's id equals its threadId, so the captured seed id
 *            IS the thread id. Capture { id } into ledger key "seed".
 *   execute  reply_to_email { originalMessageId: {{ledger.seed.id}} } -> looks up the seed,
 *            builds a threaded reply ("Re: <seed subject>"), and users.messages.send with
 *            the seed's threadId. Capture the reply { id } into ledger key "reply".
 *   verify   message_labels (SMOKE READ-BACK) -> users.messages.get by the reply id;
 *            assert `labelIds` CONTAINS "SENT" (it was sent), `threadId` == the seed id
 *            (SAME thread), AND the marker is on the `subject` ("Re: {{smokeMarker}}...").
 *            The send echo is never trusted.
 *   cleanup  [delete_email seed, delete_email reply] -> trash BOTH self-messages in the
 *            thread (each self-send is one SENT+INBOX message). cleanupKind delete.
 *
 * SELF address from SMOKE_GMAIL_SELF (discovered live). Scope: `gmail.send` +
 * `gmail.readonly`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "reply_to_email",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    originalMessageId: "{{ledger.seed.id}}",
    textBody: "{{smokeMarker}}reply body - safe to ignore",
  },
  requiredEnv: ["SMOKE_GMAIL_CONNECTED", "SMOKE_GMAIL_SELF"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "gmail",
        action: "send_email",
        config: {
          to: "{{env.SMOKE_GMAIL_SELF}}",
          subject: "{{smokeMarker}}replyseed ChainReact action-smoke - safe to ignore",
          textBody: "{{smokeMarker}}replyseed body",
        },
        captureResource: { resourceKey: "seed", idPath: "id", kind: "message" },
      },
    ],
    // reply_to_email returns { id, threadId, labelIds, replyingTo, subject }; id is the reply.
    captureResource: { resourceKey: "reply", idPath: "id", kind: "message" },
    verify: {
      provider: "gmail",
      action: "message_labels",
      config: { messageId: "{{ledger.reply.id}}" },
      smokeRead: true,
      expectContains: { path: "labelIds", value: "SENT" },
      expectEquals: { path: "threadId", value: "{{ledger.seed.id}}" },
      markerPath: "subject",
    },
    cleanupAll: [
      {
        provider: "gmail",
        action: "delete_email",
        config: { messageId: "{{ledger.seed.id}}", deleteMode: "trash" },
      },
      {
        provider: "gmail",
        action: "delete_email",
        config: { messageId: "{{ledger.reply.id}}", deleteMode: "trash" },
      },
    ],
    cleanupKind: "delete",
  },
  notes:
    "send_email seed -> reply_to_email in the seed thread -> message_labels proves SENT + " +
    "threadId==seed + Re: marker -> trash both messages. writeSafe; cleaned (to Trash).",
});
