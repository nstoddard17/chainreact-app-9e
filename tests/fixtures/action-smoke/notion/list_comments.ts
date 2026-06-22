import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * notion:list_comments — read-only single-page comment list.
 *
 * blockId (accepts a page id too) comes from env; pageSize is kept small.
 * Read-only — the report asserts only the terminal run status, never comment
 * content.
 */
export default defineActionSmokeFixture({
  provider: "notion",
  action: "list_comments",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { pageSize: 10 },
  configFromEnv: { blockId: "SMOKE_NOTION_BLOCK_ID" },
  requiredEnv: ["SMOKE_NOTION_CONNECTED", "SMOKE_NOTION_BLOCK_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Notion list_comments (pageSize 10) on the smoke block/page id.",
});
