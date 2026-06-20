import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * notion:query_database — read-only database query (one page).
 *
 * Queries a database (no filter/sorts) bounded to a small page. The database
 * id comes from SMOKE_NOTION_DATABASE_ID (overlaid onto config), so it SKIPs
 * before workflow creation until provided. Read-only — no mutation. The
 * report asserts only the terminal run status — never row properties.
 */
export default defineActionSmokeFixture({
  provider: "notion",
  action: "query_database",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { pageSize: 5 },
  configFromEnv: { databaseId: "SMOKE_NOTION_DATABASE_ID" },
  requiredEnv: ["SMOKE_NOTION_CONNECTED", "SMOKE_NOTION_DATABASE_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only Notion database query (one page, max 5); needs a connected Notion + a database id in SMOKE_NOTION_DATABASE_ID. Empty result is still a success.",
});
