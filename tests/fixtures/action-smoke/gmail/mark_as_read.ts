import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:mark_as_read (writeSafe) — remove the UNREAD label that was added in setup from a
 * smoke-owned draft, prove it is gone via an INDEPENDENT read-back, then trash the draft.
 *
 *   setup    create_draft   -> a smoke draft to SELF. Capture { messageId }.
 *   setup    mark_as_unread -> add UNREAD so there is a read-state to clear (a fresh draft
 *            has no UNREAD, so this makes the mark_as_read under test a real transition).
 *   execute  mark_as_read   -> users.messages.modify removeLabelIds ["UNREAD"].
 *   verify   message_labels (SMOKE READ-BACK) -> users.messages.get by id; assert
 *            `labelIds` NO LONGER contains "UNREAD" (the modify echo is never trusted).
 *   cleanup  delete_email (trash) -> removes the smoke draft.
 *
 * No email sent. Scope: `gmail.modify`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "mark_as_read",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    messageId: "{{ledger.msg.id}}",
  },
  requiredEnv: ["SMOKE_GMAIL_CONNECTED", "SMOKE_GMAIL_SELF"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "gmail",
        action: "create_draft",
        config: {
          to: "{{env.SMOKE_GMAIL_SELF}}",
          subject: "{{smokeMarker}}read ChainReact action-smoke - safe to ignore",
          textBody: "{{smokeMarker}}read body",
        },
        captureResource: { resourceKey: "msg", idPath: "messageId", kind: "draft" },
      },
      {
        provider: "gmail",
        action: "mark_as_unread",
        config: { messageId: "{{ledger.msg.id}}" },
      },
    ],
    verify: {
      provider: "gmail",
      action: "message_labels",
      config: { messageId: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectAbsent: { path: "labelIds", value: "UNREAD" },
    },
    cleanup: {
      provider: "gmail",
      action: "delete_email",
      config: { messageId: "{{ledger.msg.id}}", deleteMode: "trash" },
    },
    cleanupKind: "delete",
  },
  notes:
    "create_draft + mark_as_unread (setup) -> mark_as_read -> message_labels proves " +
    "labelIds no longer contains UNREAD -> delete_email(trash). writeSafe; cleaned.",
});
