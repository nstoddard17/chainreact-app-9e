import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * notion:search — read-only search across accessible pages/databases.
 *
 * `query` is required by the schema; empty string means "all accessible
 * objects". SMOKE_NOTION_QUERY is optional — when set it is overlaid onto
 * `query`; when unset the search runs with the empty-string (all) form,
 * bounded to a small page. Needs only a connected Notion. The report
 * asserts only the terminal run status — never page titles or properties.
 */
export default defineActionSmokeFixture({
  provider: "notion",
  action: "search",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { query: "", pageSize: 5 },
  configFromEnv: { query: "SMOKE_NOTION_QUERY" },
  requiredEnv: ["SMOKE_NOTION_CONNECTED"],
  expect: { outcome: "success" },
  notes:
    "Read-only Notion search (one page, max 5); needs only SMOKE_NOTION_CONNECTED. Optional SMOKE_NOTION_QUERY narrows the search; empty result is still a success.",
});
