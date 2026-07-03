import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:copy_page (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-35.
 *
 * Unblocks the async OneNote copy: Graph `POST /me/onenote/pages/{id}/copyToSection`
 * is asynchronous — the production handler returns `{ operationLocation, success:true }`
 * (success = "Graph accepted", NOT "copy complete") with NO new page id, and
 * deliberately does NOT poll. So the copied page's id was not capturable and a verified
 * copy would LEAK. The write harness's `completeAsync` phase now polls the OneNote
 * operation URL (the new `microsoft-onenote:copy_monitor` smoke seam — AUTHENTICATED
 * Graph operations endpoint) to terminal completion and captures the copied page id. The
 * PRODUCTION action is unchanged — polling lives ONLY in the smoke seam.
 *
 *   setup    create_page  -> a SMOKE-OWNED source page (marker title+body) in a
 *            smoke/test-named section (discovered live -> SMOKE_ONENOTE_SECTION_ID).
 *            Captured as "source".
 *   execute  copy_page    -> copy the source INTO the SAME smoke section. Returns
 *            `{ operationLocation, success:true }` — no page id.
 *   complete copy_monitor -> poll the TRUSTED Graph operation URL to terminal
 *   (async)  completion, capture the COMPLETED copy's page id into ledger "copy".
 *            A poll failure/timeout/no-id is VERIFY_FAILED (never proceeds uncaptured),
 *            so a created-but-unowned page can never escape cleanup.
 *   verify   get_page_content -> INDEPENDENT read-back of the COPIED page (by its real
 *            captured id, distinct from the source id) confirming the marker on the
 *            persisted `title`. The handler's `success` echo is never trusted.
 *   cleanup  delete_page (each) -> HARD-delete BOTH ledger pages (source + copy) — Graph
 *            DELETE is a true erase (not recycle). `cleanupEach` fans over every captured
 *            ledger resource, so created 2 / cleaned 2 / 0 leaked.
 *
 * The source + copy are smoke-owned PAGES (created + hard-deleted by the run); the
 * SECTION is a borrowed smoke-named container (never the user's real notebook; absent a
 * smoke/test-named section -> BLOCKED_ENV). requiredEnv is the connection signal + the
 * discovered section/notebook ids. notebookId/sectionId are UI-scope cascade parents the
 * handler ignores but the meta marks required, so the engine readiness gate needs them.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-onenote",
  action: "copy_page",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    notebookId: "{{env.SMOKE_ONENOTE_NOTEBOOK_ID}}",
    sectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
    sourcePageId: "{{ledger.source.id}}",
    // Copy INTO the same smoke section (a smoke-owned destination we already clean up).
    targetSectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
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
        captureResource: { resourceKey: "source", idPath: "id", kind: "page" },
      },
    ],
    // copy_page returns {operationLocation, success:true} with NO page id — poll the
    // TRUSTED Graph operation URL to terminal completion, THEN discover the DURABLE
    // copied page. OneNote copyToSection's terminal id is ephemeral (Graph may report it
    // as deleted), so the seam re-lists the target section and picks the page carrying
    // the run marker whose id != the source page id — that durable id is captured for
    // verify + cleanup. (Absent these config keys the seam falls back to the poll id.)
    completeAsync: {
      monitorUrlPath: "operationLocation",
      provider: "microsoft-onenote",
      action: "copy_monitor",
      captureResource: { resourceKey: "copy", idPath: "pageId", kind: "page" },
      config: {
        sectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
        marker: "{{smokeMarker}}",
        sourcePageId: "{{ledger.source.id}}",
      },
    },
    verify: {
      provider: "microsoft-onenote",
      action: "get_page_content",
      config: {
        notebookId: "{{env.SMOKE_ONENOTE_NOTEBOOK_ID}}",
        sectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
        // Read the COPY by its own captured id (distinct from the source id) — proves
        // the copied page exists and carries the marker title.
        pageId: "{{ledger.copy.id}}",
      },
      markerPath: "title",
    },
    // HARD-delete BOTH the source and the copy (Graph DELETE = true erase). cleanupEach
    // fans over every captured ledger resource (source + copy).
    cleanupEach: {
      provider: "microsoft-onenote",
      action: "delete_page",
      config: {
        notebookId: "{{env.SMOKE_ONENOTE_NOTEBOOK_ID}}",
        sectionId: "{{env.SMOKE_ONENOTE_SECTION_ID}}",
        pageId: "{{each.id}}",
      },
    },
    cleanupKind: "delete",
  },
  notes:
    "SMOKE-WRITE-35 — setup create smoke source page -> copy_page into the same smoke " +
    "section (async: returns operationLocation) -> completeAsync polls the TRUSTED Graph " +
    "OneNote operation URL (authenticated copy_monitor seam) and captures the copied " +
    "page id -> get_page_content read-back marker on the copy's title -> delete_page " +
    "both source + copy (hard delete). destructiveSafe. PRODUCTION action unchanged — " +
    "polling is smoke-only.",
});
