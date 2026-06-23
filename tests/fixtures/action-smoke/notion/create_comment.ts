import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — notion:create_comment (destructiveSafe, archive -> left artifact).
 *
 *   setup    create_page    -> capture { pageId }
 *   execute  create_comment -> comment on the page; text is the marker. The
 *                              response echoes the provider's stored plainText
 *                              (authoritative, no input fallback) -> markerEcho.
 *   verify   list_comments  -> READ-BACK the page's comments and confirm the
 *                              marker (independent read).
 *   cleanup  archive_page   -> archive the page (comment hidden with it).
 */
export default defineWriteSmokeFixture({
  provider: "notion",
  action: "create_comment",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    pageId: "{{ledger.page.id}}",
    text: "{{smokeMarker}}comment",
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
    // create_comment's response echoes the stored `plainText` (no input fallback).
    markerEchoPath: "plainText",
    // ...and list_comments independently reads the comments back (array-aware).
    verify: {
      provider: "notion",
      action: "list_comments",
      config: { blockId: "{{ledger.page.id}}" },
      markerPath: "comments",
    },
    cleanupKind: "archive",
    cleanup: {
      provider: "notion",
      action: "archive_page",
      config: { pageId: "{{ledger.page.id}}" },
    },
  },
  notes: "PILOT — create page -> comment (marker) -> list_comments read-back marker -> archive page.",
});
