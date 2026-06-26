import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:update_page (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-32.
 *
 *   setup    create_page  -> create a smoke-owned page in the smoke section (its body is
 *            "<p><marker>body</p>"). Capture { id } into ledger key "page".
 *   execute  update_page  -> APPEND "<p><marker>updated</p>" to the page body
 *            (updateMode "append"). The handler's `success: true` echo is never trusted.
 *   verify   get_page_content -> READ-BACK the page and confirm the marker on the
 *            PERSISTED `content` (the rendered HTML body) with markerSuffix "updated" ->
 *            requires "<marker>updated". The original body carries "<marker>body" (no
 *            "updated"), so a no-op append would fail — this proves the append landed.
 *   cleanup  delete_page  -> HARD-delete the ledger page.
 *
 * requiredEnv: connection signal + the discovered smoke section id (for setup).
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-onenote",
  action: "update_page",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // notebookId/sectionId are required cascade parents for readiness (handler ignores).
    notebookId: "{{env.SMOKE_ONENOTE_NOTEBOOK_ID}}",
    sectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
    pageId: "{{ledger.page.id}}",
    updateMode: "append",
    content: "<p>{{smokeMarker}}updated</p>",
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
    verify: {
      provider: "microsoft-onenote",
      action: "get_page_content",
      config: {
        notebookId: "{{env.SMOKE_ONENOTE_NOTEBOOK_ID}}",
        sectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
        pageId: "{{ledger.page.id}}",
      },
      // The appended HTML body shows up in the rendered `content`; suffix proves the append.
      markerPath: "content",
      markerSuffix: "updated",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-onenote",
      action: "delete_page",
      config: {
        notebookId: "{{env.SMOKE_ONENOTE_NOTEBOOK_ID}}",
        sectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
        pageId: "{{ledger.page.id}}",
      },
    },
  },
  notes:
    "SMOKE-WRITE-32 — create smoke page -> update_page append <marker>updated -> " +
    "get_page_content read-back marker(+suffix updated) on content -> delete_page " +
    "(hard delete). destructiveSafe.",
});
