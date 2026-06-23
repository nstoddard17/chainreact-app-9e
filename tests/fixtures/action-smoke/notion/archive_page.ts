import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — notion:archive_page (destructiveSafe, archive -> left artifact).
 *
 * archive_page is exercised today only as the CLEANUP step of every other Notion
 * pilot — nothing verifies it actually flips `archived`. This fixture verifies the
 * STATE CHANGE independently:
 *
 *   setup    create_page  -> capture { pageId } (marker-seed title)
 *   execute  archive_page -> archive exactly the ledger-created page
 *   verify   get_page     -> READ-BACK and assert BOTH the marker on `title`
 *                            (this is OUR page) AND `archived == true` (the state
 *                            actually changed). archive_page's own output hard-
 *                            codes `archived ?? true`, so the flag is only
 *                            trustworthy via an INDEPENDENT get_page read-back.
 *   (no cleanup)            the EXECUTE step IS the disposition — the page is
 *                            already archived. Notion REJECTS editing an archived
 *                            page ("Can't edit block that is archived"), so a
 *                            re-archive cleanup is impossible; the run honestly
 *                            leaves a harmless archived smoke page (artifact "left",
 *                            reversible via restore_page). NOT a harmful leak.
 *
 * Parent page auto-discovered by the dev test (smoke/test-named preferred, else
 * the first accessible page on the throwaway account).
 */
export default defineWriteSmokeFixture({
  provider: "notion",
  action: "archive_page",
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
    ],
    // get_page is an INDEPENDENT read-back: confirm OUR page (marker on title) AND
    // that archive actually took effect (archived flag) — the action's own output
    // hard-codes the flag, so only get_page proves it.
    verify: {
      provider: "notion",
      action: "get_page",
      config: { pageId: "{{ledger.page.id}}" },
      markerPath: "title",
      expectEquals: { path: "archived", value: true },
    },
    // No cleanup: the EXECUTE step already archived the page, and Notion rejects
    // editing an archived page, so re-archiving is impossible. The run leaves a
    // harmless archived smoke page (artifact "left"), reversible via restore_page.
  },
  notes:
    "PILOT — create -> archive -> get_page read-back asserts marker + archived==true. " +
    "No cleanup (page archived by execute; Notion forbids editing archived pages). " +
    "Leaves a harmless archived smoke page; verifies archive STATE independently.",
});
