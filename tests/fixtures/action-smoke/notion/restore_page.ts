import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — notion:restore_page (destructiveSafe, archive -> left artifact).
 *
 * The inverse of archive_page: prove that restore flips `archived` back to false,
 * verified INDEPENDENTLY (restore_page's own output hard-codes `archived ?? false`).
 *
 *   setup    create_page  -> capture { pageId } (marker-seed title)
 *   setup    archive_page -> archive the page so there is something to restore
 *   execute  restore_page -> un-archive exactly the ledger-created page
 *   verify   get_page     -> READ-BACK and assert BOTH the marker on `title` AND
 *                            `archived == false` (the page is genuinely restored —
 *                            an archived page is also readable, so the marker alone
 *                            cannot distinguish restored from archived).
 *   cleanup  archive_page -> re-archive the same ledger page (best-effort) so the
 *                            run leaves only a harmless archived smoke page.
 *
 * Parent page auto-discovered by the dev test (smoke/test-named preferred).
 */
export default defineWriteSmokeFixture({
  provider: "notion",
  action: "restore_page",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    pageId: "{{ledger.page.id}}",
  },
  requiredEnv: ["SMOKE_NOTION_CONNECTED", "SMOKE_NOTION_PARENT_PAGE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "notion",
        action: "create_page",
        config: {
          parent: { pageId: "{{env.SMOKE_NOTION_PARENT_PAGE_ID}}" },
          properties: { title: { type: "title", value: "{{smokeMarker}}seed" } },
        },
        captureResource: { resourceKey: "page", idPath: "pageId", kind: "page" },
      },
      {
        provider: "notion",
        action: "archive_page",
        config: { pageId: "{{ledger.page.id}}" },
      },
    ],
    // Independent get_page read-back: OUR page (marker) AND archived flipped to false.
    verify: {
      provider: "notion",
      action: "get_page",
      config: { pageId: "{{ledger.page.id}}" },
      markerPath: "title",
      expectEquals: { path: "archived", value: false },
    },
    cleanupKind: "archive",
    cleanup: {
      provider: "notion",
      action: "archive_page",
      config: { pageId: "{{ledger.page.id}}" },
    },
  },
  notes:
    "PILOT — create -> archive -> restore -> get_page read-back asserts marker + " +
    "archived==false -> re-archive. Verifies restore STATE independently.",
});
