import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — notion:create_page (destructiveSafe, least-destructive).
 *
 * Notion archive is REVERSIBLE (restore_page exists), so the cleanup here removes
 * the page from view without true data loss — the gentlest of the three pilots.
 *
 *   execute  create_page  -> capture { pageId } into ledger key "page"
 *   verify   get_page     -> read the page back and CONFIRM THE MARKER on its
 *                            `title` (not merely that the id exists)
 *   cleanup  archive_page -> archive exactly the ledger-created page (reversible)
 *
 * The parent smoke page is auto-discovered by the dev test (smoke/test-named
 * preferred, else the first accessible page on the throwaway account) and overlaid
 * onto SMOKE_NOTION_PARENT_PAGE_ID. Title carries the run marker.
 */
export default defineWriteSmokeFixture({
  provider: "notion",
  action: "create_page",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    parent: { pageId: "{{env.SMOKE_NOTION_PARENT_PAGE_ID}}" },
    properties: { title: { type: "title", value: "{{smokeMarker}}pilot" } },
  },
  requiredEnv: ["SMOKE_NOTION_CONNECTED", "SMOKE_NOTION_PARENT_PAGE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    // create_page returns { pageId }, not { id }.
    captureResource: { resourceKey: "page", idPath: "pageId", kind: "page" },
    // get_page now exposes a top-level `title`; confirm the unique marker on the
    // read-back title (proves the marker on the persisted page, not just existence).
    verify: {
      provider: "notion",
      action: "get_page",
      config: { pageId: "{{ledger.page.id}}" },
      markerPath: "title",
    },
    // archive_page is reversible (restore_page exists) -> best-effort, leaves a
    // harmless archived page (LIVE_PASS_LEFT_ARTIFACT), never a gate fail.
    cleanupKind: "archive",
    cleanup: {
      provider: "notion",
      action: "archive_page",
      config: { pageId: "{{ledger.page.id}}" },
    },
  },
  notes:
    "PILOT (not registered, not run live): create -> get -> archive a throwaway " +
    "page under a DEDICATED smoke parent page. archive_page is reversible " +
    "(restore_page). destructiveSafe — needs the write + destructive gates.",
});
