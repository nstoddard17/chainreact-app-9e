import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * notion:get_block — read-only single-block metadata.
 *
 * Sends `GET /v1/blocks/{block_id}` and returns a flat block descriptor. In Notion a
 * page id and its block id share the same id space, so a page id is a valid block id
 * (retrieving it returns the page's block object) — we reuse SMOKE_NOTION_PAGE_ID as
 * the blockId so no separate block-id env is needed. Read-only. The report asserts
 * only the terminal run status — never block content (block bodies are user-typed).
 */
export default defineActionSmokeFixture({
  provider: "notion",
  action: "get_block",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { blockId: "SMOKE_NOTION_PAGE_ID" },
  requiredEnv: ["SMOKE_NOTION_CONNECTED", "SMOKE_NOTION_PAGE_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only Notion block metadata; needs a connected Notion + a block/page id in " +
    "SMOKE_NOTION_PAGE_ID (a page id is a valid block id).",
});
