import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:create_page (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-32.
 *
 * The smoke-owned resource is the PAGE (created + hard-deleted by the run); the SECTION
 * is a borrowed container (like a Trello list / Notion parent page). The live dev test
 * discovers a SAFE section — one whose section OR notebook name is smoke/test-named — and
 * overlays it as `SMOKE_ONENOTE_SECTION_ID` (absent -> BLOCKED_ENV, never a write into a
 * real notebook).
 *
 *   execute  create_page  -> create a marker-TITLED page in the smoke section. Capture
 *            { id } into ledger key "page".
 *   verify   get_page_content -> READ-BACK by id and confirm the marker on the PERSISTED
 *            `title` (an INDEPENDENT Graph read; create_page's title output also reflects
 *            Graph, but get_page_content is a separate call against the live page).
 *   cleanup  delete_page  -> HARD-delete exactly the ledger page (Graph DELETE — a true
 *            erase, not recycle).
 *
 * requiredEnv: connection signal + the discovered section id.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-onenote",
  action: "create_page",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // notebookId is a UI-scope cascade parent the handler IGNORES, but the create_page
    // meta marks it required, so the engine readiness gate needs it present.
    notebookId: "{{env.SMOKE_ONENOTE_NOTEBOOK_ID}}",
    sectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
    title: "{{smokeMarker}}page",
    content: "<p>{{smokeMarker}}body</p>",
    contentType: "text/html",
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
    captureResource: { resourceKey: "page", idPath: "id", kind: "page" },
    verify: {
      provider: "microsoft-onenote",
      action: "get_page_content",
      // notebookId/sectionId are required cascade parents for readiness (handler ignores).
      config: {
        notebookId: "{{env.SMOKE_ONENOTE_NOTEBOOK_ID}}",
        sectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
        pageId: "{{ledger.page.id}}",
      },
      markerPath: "title",
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
    "SMOKE-WRITE-32 — create marker-titled page in a smoke/test-named section -> " +
    "get_page_content read-back marker on title -> delete_page (hard delete). " +
    "Page is smoke-owned; section is a borrowed smoke-named container. destructiveSafe.",
});
