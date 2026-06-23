import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — notion:create_database_entry (destructiveSafe, archive -> left artifact).
 *
 *   execute  create_database_entry -> capture { pageId } into ledger key "entry"
 *                            (a database row IS a page). Its title property carries
 *                            the unique marker.
 *   verify   query_database  -> READ-BACK the database filtered to the marker title
 *                            and confirm the marker appears in a returned row. This
 *                            is an INDEPENDENT registered read action — never the
 *                            create response echo. (array-aware marker check on
 *                            `results`.)
 *   cleanup  archive_page    -> archive exactly the ledger-created entry (reversible)
 *
 * The database + its title-property NAME are resolved by the dev test
 * (SMOKE_NOTION_DATABASE_ID pinned-or-discovered; SMOKE_NOTION_DB_TITLE_FIELD
 * always discovered from the database schema). When no smoke database exists the
 * run is BLOCKED_ENV — never faked.
 */
export default defineWriteSmokeFixture({
  provider: "notion",
  action: "create_database_entry",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    databaseId: "{{env.SMOKE_NOTION_DATABASE_ID}}",
    // The title-property KEY is the database's title field NAME (varies per DB),
    // overlaid from discovery; the harness resolves env tokens in object keys.
    properties: {
      "{{env.SMOKE_NOTION_DB_TITLE_FIELD}}": { type: "title", value: "{{smokeMarker}}entry" },
    },
  },
  requiredEnv: [
    "SMOKE_NOTION_CONNECTED",
    "SMOKE_NOTION_DATABASE_ID",
    "SMOKE_NOTION_DB_TITLE_FIELD",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "entry", idPath: "pageId", kind: "page" },
    // Independent read-back via a REGISTERED read action, filtered to the marker
    // title so it is robust regardless of database size. The marker on the row's
    // title property appears in the serialized `results` (array-aware check).
    verify: {
      provider: "notion",
      action: "query_database",
      config: {
        databaseId: "{{env.SMOKE_NOTION_DATABASE_ID}}",
        filter: {
          property: "{{env.SMOKE_NOTION_DB_TITLE_FIELD}}",
          title: { contains: "{{smokeMarker}}" },
        },
      },
      markerPath: "results",
    },
    // A database row is a page -> archive_page removes it from the database view.
    cleanupKind: "archive",
    cleanup: {
      provider: "notion",
      action: "archive_page",
      config: { pageId: "{{ledger.entry.id}}" },
    },
  },
  notes:
    "PILOT — create database entry (marker title) -> query_database read-back " +
    "(filtered to marker) confirms the row -> archive entry. Independent read-back, " +
    "not the create echo. destructiveSafe; BLOCKED_ENV when no smoke database.",
});
