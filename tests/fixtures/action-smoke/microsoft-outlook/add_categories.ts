import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook:add_categories (destructiveSafe, cleaned) — PATCH-set a marker
 * category on a smoke-owned DRAFT, prove it via an independent per-message read,
 * then permanently delete the draft.
 *
 *   setup    create_draft_email -> a marker-subjected draft (never sent; reserved
 *            .invalid recipient). Drafts are real Graph messages, so categories
 *            PATCH works on them — no mail transport involved at all. Capture
 *            { draftId } into ledger key "draft".
 *   execute  add_categories -> PATCH categories: ["{{smokeMarker}}cat"]. The
 *            handler's echo is never trusted.
 *   verify   message_state (SMOKE READ-BACK) -> Graph GET of the draft; asserts
 *            `categories` CONTAINS the marker category AND the marker is on the
 *            persisted subject.
 *   cleanup  delete_email -> permanently deletes exactly the captured draft.
 *
 * PATCH-replace semantics (documented in the handler): a fresh draft has NO
 * categories, so replace == add here; the read-back proves the final list.
 * Scope: Mail.ReadWrite.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook",
  action: "add_categories",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    emailId: "{{ledger.draft.id}}",
    categories: "{{smokeMarker}}cat",
  },
  requiredEnv: ["SMOKE_MICROSOFT_OUTLOOK_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "microsoft-outlook",
        action: "create_draft_email",
        config: {
          to: "smoke-categories@example.invalid",
          subject: "{{smokeMarker}}categories draft - safe to ignore",
          body: "{{smokeMarker}}categories body",
          isHtml: false,
          importance: "normal",
        },
        captureResource: { resourceKey: "draft", idPath: "draftId", kind: "draft" },
      },
    ],
    verify: {
      provider: "microsoft-outlook",
      action: "message_state",
      config: { messageId: "{{ledger.draft.id}}" },
      smokeRead: true,
      expectContains: { path: "categories", value: "{{smokeMarker}}cat" },
      markerPath: "subject",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-outlook",
      action: "delete_email",
      config: { emailId: "{{ledger.draft.id}}", deleteMode: "permanent" },
    },
  },
  notes:
    "create_draft_email (never sent) -> add_categories marker category -> " +
    "message_state read-back proves categories contains the marker + marker subject " +
    "-> delete_email permanent erases the draft. destructiveSafe; cleaned.",
});
