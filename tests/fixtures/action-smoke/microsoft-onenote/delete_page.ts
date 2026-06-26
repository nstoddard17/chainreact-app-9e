import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:delete_page (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-32.
 *
 *   setup    create_page   -> create a smoke-owned page in the smoke section. Capture
 *            { id } into ledger key "page".
 *   execute  delete_page   -> HARD-delete exactly the ledger page (Graph DELETE — a true
 *            erase). The execute IS the disposition (executeIsCleanup) — no separate
 *            cleanup step. The handler's `success: true` echo is never trusted.
 *   verify   page_metadata -> INDEPENDENT smoke read-back asserting the page is ABSENT
 *            (`exists == false`). A deleted page returns Graph 404 -> TYPED NotFoundError
 *            mapped to exists:false; ANY other error propagates -> VERIFY_FAILED (a
 *            permission/API failure can never read as "deleted").
 *
 * Operates ONLY on a page THIS run created in a smoke/test-named section. requiredEnv:
 * connection signal + the discovered smoke section id (for setup).
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-onenote",
  action: "delete_page",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    // notebookId/sectionId are required cascade parents for readiness (handler ignores).
    notebookId: "{{env.SMOKE_ONENOTE_NOTEBOOK_ID}}",
    sectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
    pageId: "{{ledger.page.id}}",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_ONENOTE_CONNECTED",
    "SMOKE_ONENOTE_SECTION_ID",
    "SMOKE_ONENOTE_NOTEBOOK_ID",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "microsoft-onenote",
        action: "create_page",
        config: {
          notebookId: "{{env.SMOKE_ONENOTE_NOTEBOOK_ID}}",
          sectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
          title: "{{smokeMarker}}page",
          content: "<p>{{smokeMarker}}body</p>",
          contentType: "text/html",
        },
        captureResource: { resourceKey: "page", idPath: "id", kind: "page" },
      },
    ],
    // The delete under test removes the smoke page -> it IS the disposition.
    executeIsCleanup: true,
    verify: {
      provider: "microsoft-onenote",
      action: "page_metadata",
      config: { pageId: "{{ledger.page.id}}" },
      expectEquals: { path: "exists", value: false },
      smokeRead: true,
    },
  },
  notes:
    "SMOKE-WRITE-32 — create smoke page -> delete_page (hard delete) -> independent " +
    "page_metadata exists==false. Absence proven via typed 404 NotFoundError, not the " +
    "handler echo. destructiveSafe.",
});
