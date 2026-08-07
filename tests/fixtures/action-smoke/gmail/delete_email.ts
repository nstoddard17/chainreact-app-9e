import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:delete_email (destructiveSafe, execute IS the disposition) — trash a smoke-owned
 * draft, then prove the trash side effect via an INDEPENDENT read-back.
 *
 *   setup    create_draft -> a smoke draft to SELF. Capture { messageId }.
 *   execute  delete_email { deleteMode: "trash" } -> users.messages.trash. The execute IS
 *            the disposition (executeIsCleanup) — no separate cleanup step. Trash removes
 *            the draft from in:drafts (verified live) and is recoverable ~30d.
 *   verify   message_labels (SMOKE READ-BACK) -> users.messages.get by id; assert
 *            `labelIds` CONTAINS "TRASH" (a trashed message keeps its id but gains TRASH;
 *            the delete echo is never trusted).
 *
 * Uses `deleteMode: "trash"` — the ONLY supported mode. The former "permanent" mode is
 * retired (GOOGLE-OAUTH-REVIEW-READINESS-2): users.messages.delete needs the
 * never-requested mail.google.com scope, and the handler now rejects a legacy
 * "permanent" config with a clear error. No email sent. Scope: `gmail.modify`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "delete_email",
  // "delete" is an obviously-destructive verb -> destructiveSafe (executeIsCleanup).
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    messageId: "{{ledger.msg.id}}",
    deleteMode: "trash",
  },
  requiredEnv: ["SMOKE_GMAIL_CONNECTED", "SMOKE_GMAIL_SELF"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "gmail",
        action: "create_draft",
        config: {
          to: "{{env.SMOKE_GMAIL_SELF}}",
          subject: "{{smokeMarker}}delete ChainReact action-smoke - safe to ignore",
          textBody: "{{smokeMarker}}delete body",
        },
        captureResource: { resourceKey: "msg", idPath: "messageId", kind: "draft" },
      },
    ],
    // The trash under test removes the smoke draft -> it IS the disposition.
    executeIsCleanup: true,
    verify: {
      provider: "gmail",
      action: "message_labels",
      config: { messageId: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectContains: { path: "labelIds", value: "TRASH" },
    },
  },
  notes:
    "create_draft -> delete_email(trash) that exact draft (executeIsCleanup) -> " +
    "message_labels proves labelIds contains TRASH. destructiveSafe; cleaned (to Trash, " +
    "recoverable ~30d).",
});
