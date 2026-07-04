import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:create_draft_reply (writeSafe) — create a DRAFT reply to a self-sent smoke seed,
 * prove the draft is in the SAME thread and carries the marker, then trash both.
 *
 *   setup    send_email -> self-send a `{{smokeMarker}}draftreplyseed` seed. A first
 *            message's id equals its threadId, so the captured seed id IS the thread id.
 *            Capture { id } into ledger key "seed".
 *   execute  create_draft_reply { originalMessageId: {{ledger.seed.id}} } -> looks up the
 *            seed, builds a threaded reply, and users.drafts.create with the seed's
 *            threadId. Capture the draft's underlying { messageId } into ledger key "draft".
 *   verify   message_labels (SMOKE READ-BACK) -> users.messages.get by the draft message
 *            id; assert `labelIds` CONTAINS "DRAFT" (it is a draft, not sent), `threadId`
 *            == the seed id (SAME thread), AND the marker is on the `subject` ("Re: ...").
 *            The create echo is never trusted.
 *   cleanup  [delete_email seed, delete_email draft] -> trash the self-send seed AND the
 *            draft message (trashing a draft's message removes it from in:drafts).
 *            cleanupKind delete.
 *
 * SELF address from SMOKE_GMAIL_SELF (discovered live). Scope: `gmail.compose` +
 * `gmail.readonly`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "create_draft_reply",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    originalMessageId: "{{ledger.seed.id}}",
    textBody: "{{smokeMarker}}draftreply body - safe to ignore",
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
          subject: "{{smokeMarker}}draftreplyseed ChainReact action-smoke - safe to ignore",
          textBody: "{{smokeMarker}}draftreplyseed body",
        },
        captureResource: { resourceKey: "seed", idPath: "id", kind: "message" },
      },
    ],
    // create_draft_reply returns { draftId, messageId, threadId, ... }; messageId is the
    // draft's underlying Gmail message id.
    captureResource: { resourceKey: "draft", idPath: "messageId", kind: "draft" },
    verify: {
      provider: "gmail",
      action: "message_labels",
      config: { messageId: "{{ledger.draft.id}}" },
      smokeRead: true,
      expectContains: { path: "labelIds", value: "DRAFT" },
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
        config: { messageId: "{{ledger.draft.id}}", deleteMode: "trash" },
      },
    ],
    cleanupKind: "delete",
  },
  notes:
    "send_email seed -> create_draft_reply in the seed thread -> message_labels proves " +
    "DRAFT + threadId==seed + Re: marker -> trash seed + draft. writeSafe; cleaned (to Trash).",
});
