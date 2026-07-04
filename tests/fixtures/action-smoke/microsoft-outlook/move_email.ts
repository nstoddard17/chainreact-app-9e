import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook:move_email (destructiveSafe, cleaned) — move a smoke-owned
 * DRAFT into the well-known Archive folder, prove placement via an independent
 * folder read-back, then permanently delete it.
 *
 *   setup    create_draft_email -> a marker-subjected draft (never sent). Capture
 *            { draftId } into ledger key "draft".
 *   execute  move_email { destinationFolderId: "archive" } -> Graph RE-KEYS the
 *            message on move; the execute capture writes the returned `newId` to
 *            the SAME ledger key "draft" (the ledger is a Map — same key replaces
 *            the entry). Honest accounting: the old id is dead by re-key, the new
 *            id IS the same message, so the ledger tracks exactly one resource and
 *            cleanup targets the live id.
 *   verify   find_messages (SMOKE READ-BACK) -> bounded poll of the archive folder
 *            for the run-unique marker subject; the move echo is never trusted.
 *   cleanup  delete_email -> permanently deletes {{ledger.draft.id}} (the newId).
 *
 * Scope: Mail.ReadWrite.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook",
  action: "move_email",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    emailId: "{{ledger.draft.id}}",
    destinationFolderId: "archive",
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
          to: "smoke-move@example.invalid",
          subject: "{{smokeMarker}}move draft - safe to ignore",
          body: "{{smokeMarker}}move body",
          isHtml: false,
          importance: "normal",
        },
        captureResource: { resourceKey: "draft", idPath: "draftId", kind: "draft" },
      },
    ],
    // Same resourceKey as the setup capture — the move re-keys the message, so the
    // newId REPLACES the ledger entry (one resource, tracked by its live id).
    captureResource: { resourceKey: "draft", idPath: "newId", kind: "draft" },
    verify: {
      provider: "microsoft-outlook",
      action: "find_messages",
      config: { folders: "archive", contains: "{{smokeMarker}}move", minCount: "1" },
      smokeRead: true,
      expectEquals: { path: "found", value: true },
      markerPath: "subjects",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-outlook",
      action: "delete_email",
      config: { emailId: "{{ledger.draft.id}}", deleteMode: "permanent" },
    },
  },
  notes:
    "create_draft_email -> move_email to the well-known archive folder (Graph " +
    "re-keys; newId replaces the ledger entry) -> find_messages proves the marker " +
    "subject is IN archive -> delete_email permanent erases it. destructiveSafe; " +
    "cleaned.",
});
