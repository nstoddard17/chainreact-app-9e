import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — notion:update_page (destructiveSafe, archive -> left artifact).
 *
 *   setup    create_page  -> capture { pageId } (marker-seed title)
 *   execute  update_page  -> rewrite the title to the marker-"updated" value
 *   verify   get_page     -> READ-BACK the page and confirm the marker on `title`
 *                            (update_page's own response omits the title)
 *   cleanup  archive_page -> archive exactly the ledger-created page (reversible)
 *
 * Parent page auto-discovered by the dev test (smoke/test-named preferred, else
 * the first accessible page on the throwaway account).
 */
export default defineWriteSmokeFixture({
  provider: "notion",
  action: "update_page",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    pageId: "{{ledger.page.id}}",
    properties: { title: { type: "title", value: "{{smokeMarker}}updated" } },
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
    ],
    // get_page exposes a bounded top-level `title`; confirm the UPDATED marker.
    verify: {
      provider: "notion",
      action: "get_page",
      config: { pageId: "{{ledger.page.id}}" },
      markerPath: "title",
    },
    cleanupKind: "archive",
    cleanup: {
      provider: "notion",
      action: "archive_page",
      config: { pageId: "{{ledger.page.id}}" },
    },
  },
  notes: "PILOT — create -> update title -> get_page read-back marker -> archive. destructiveSafe; archive.",
});
