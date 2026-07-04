import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:mark_as_unread (writeSafe) — add the UNREAD system label to a smoke-owned draft
 * message, prove it landed via an INDEPENDENT read-back, then trash the draft.
 *
 *   setup    create_draft -> a smoke draft to SELF (labelIds ["DRAFT"], no UNREAD).
 *            Capture { messageId }.
 *   execute  mark_as_unread -> users.messages.modify addLabelIds ["UNREAD"].
 *   verify   message_labels (SMOKE READ-BACK) -> users.messages.get by id; assert
 *            `labelIds` CONTAINS "UNREAD" (the modify echo is never trusted).
 *   cleanup  delete_email (trash) -> removes the smoke draft.
 *
 * A fresh draft has no UNREAD, so adding it is a real, verifiable transition. No email
 * sent. Scope: `gmail.modify`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "mark_as_unread",
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
          subject: "{{smokeMarker}}unread ChainReact action-smoke - safe to ignore",
          textBody: "{{smokeMarker}}unread body",
        },
        captureResource: { resourceKey: "msg", idPath: "messageId", kind: "draft" },
      },
    ],
    verify: {
      provider: "gmail",
      action: "message_labels",
      config: { messageId: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectContains: { path: "labelIds", value: "UNREAD" },
    },
    cleanup: {
      provider: "gmail",
      action: "delete_email",
      config: { messageId: "{{ledger.msg.id}}", deleteMode: "trash" },
    },
    cleanupKind: "delete",
  },
  notes:
    "create_draft -> mark_as_unread -> message_labels proves labelIds contains UNREAD -> " +
    "delete_email(trash). writeSafe; cleaned (to Trash).",
});
