import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook:delete_email (destructiveSafe, execute IS the disposition) —
 * trash a smoke-owned DRAFT, then prove the trash side effect via an INDEPENDENT
 * folder read-back.
 *
 *   setup    create_draft_email -> a marker-subjected draft (never sent). Capture
 *            { draftId } into ledger key "draft".
 *   execute  delete_email { deleteMode: "trash" } -> Graph move to the well-known
 *            deleteditems folder. The execute IS the disposition
 *            (executeIsCleanup) — no separate cleanup step.
 *   verify   find_messages (SMOKE READ-BACK) -> bounded poll of deleteditems for
 *            the run-unique marker subject. Positive placement proof — Graph
 *            re-keys on the trash move, so a GET by the old id could not prove
 *            anything; the marker-subject folder read can. The delete echo is
 *            never trusted.
 *
 * Uses `deleteMode: "trash"` (recoverable, Deleted Items) so the read-back can
 * POSITIVELY prove the state; the "permanent" mode shares the same handler and is
 * exercised as the cleanup step of the other six Outlook mail fixtures (a 404-on-
 * read-back could never distinguish "erased" from "wrong id"). Gmail delete_email
 * precedent. Scope: Mail.ReadWrite.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook",
  action: "delete_email",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    emailId: "{{ledger.draft.id}}",
    deleteMode: "trash",
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
          to: "smoke-delete@example.invalid",
          subject: "{{smokeMarker}}trashdelete draft - safe to ignore",
          body: "{{smokeMarker}}trashdelete body",
          isHtml: false,
          importance: "normal",
        },
        captureResource: { resourceKey: "draft", idPath: "draftId", kind: "draft" },
      },
    ],
    // The trash under test removes the smoke draft from its folder -> it IS the
    // disposition (the draft sits in Deleted Items, recoverable).
    executeIsCleanup: true,
    verify: {
      provider: "microsoft-outlook",
      action: "find_messages",
      config: { folders: "deleteditems", contains: "{{smokeMarker}}trashdelete", minCount: "1" },
      smokeRead: true,
      expectEquals: { path: "found", value: true },
      markerPath: "subjects",
    },
  },
  notes:
    "create_draft_email -> delete_email(trash) that exact draft (executeIsCleanup) " +
    "-> find_messages proves the marker subject is IN deleteditems. destructiveSafe; " +
    "cleaned (to Deleted Items, recoverable). The permanent mode is exercised as the " +
    "other Outlook fixtures' cleanup step.",
});
