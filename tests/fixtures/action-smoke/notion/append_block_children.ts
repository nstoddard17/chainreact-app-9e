import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — notion:append_block_children (destructiveSafe, archive -> left artifact).
 *
 *   setup    create_page          -> capture { pageId }
 *   execute  append_block_children -> append a paragraph whose text is the marker
 *   verify   get_block_children    -> READ-BACK the page's blocks and confirm the
 *                                     marker appears in a block (the append response
 *                                     returns only ids/count, no text)
 *   cleanup  archive_page          -> archive exactly the ledger-created page
 *
 * The block lives under the smoke page; archiving the page removes it.
 */
export default defineWriteSmokeFixture({
  provider: "notion",
  action: "append_block_children",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    blockId: "{{ledger.page.id}}",
    children: [{ type: "paragraph", text: "{{smokeMarker}}block" }],
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
    // get_block_children returns a `blocks` array (each with extracted plainText);
    // confirm the marker appears in the read-back blocks (array-aware marker check).
    verify: {
      provider: "notion",
      action: "get_block_children",
      config: { blockId: "{{ledger.page.id}}" },
      markerPath: "blocks",
    },
    cleanupKind: "archive",
    cleanup: {
      provider: "notion",
      action: "archive_page",
      config: { pageId: "{{ledger.page.id}}" },
    },
  },
  notes: "PILOT — create page -> append paragraph -> get_block_children read-back marker -> archive page.",
});
