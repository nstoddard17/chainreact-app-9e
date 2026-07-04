import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * notion:create_database (writeSafe, artifact left) — create a deterministic
 * crsmoke- database under the discovered smoke parent page, then prove it
 * exists via the REGISTERED query_database read.
 *
 *   execute  create_database -> POST /v1/databases under
 *            SMOKE_NOTION_PARENT_PAGE_ID (the same discovered parent the
 *            certified create_page uses) with a marker title + the minimal
 *            valid schema (exactly one title property). Capture { databaseId }
 *            into ledger key "db". markerEchoPath proves the marker on the
 *            RESPONSE-reconstructed title (Notion's persisted rich_text, not an
 *            input echo).
 *   verify   query_database -> INDEPENDENT read keyed on the captured id; a bad
 *            id would 404 the step, and expectEmpty proves the fresh database's
 *            `results` is present-and-empty — existence proven by id, never the
 *            create echo.
 *
 * DISPOSITION: none. V2 registers no database archive/delete (archive_page is
 * pages-only), so the empty marked database stays under the smoke parent page
 * (mailchimp:create_segment precedent). Each run leaves one empty marked
 * database.
 */
export default defineWriteSmokeFixture({
  provider: "notion",
  action: "create_database",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    parentPageId: "{{env.SMOKE_NOTION_PARENT_PAGE_ID}}",
    title: "{{smokeMarker}}database",
    properties: { Name: { type: "title" } },
  },
  requiredEnv: ["SMOKE_NOTION_CONNECTED", "SMOKE_NOTION_PARENT_PAGE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "db", idPath: "databaseId", kind: "database" },
    markerEchoPath: "title",
    verify: {
      provider: "notion",
      action: "query_database",
      config: { databaseId: "{{ledger.db.id}}" },
      expectEmpty: { path: "results" },
    },
    // No cleanup: no registered database archive/delete -> marked artifact left.
  },
  notes:
    "create_database (marker title, one title property) under the discovered smoke " +
    "parent page -> query_database read-back proves existence by id (results " +
    "present-and-empty). writeSafe; empty marked database artifact left (no " +
    "registered database delete).",
});
