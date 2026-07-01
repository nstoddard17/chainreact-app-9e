import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * notion:get_block_children — read-only list of a block's (or page's) child blocks.
 *
 * Sends `GET /v1/blocks/{block_id}/children`. The `blockId` field is dual-meaning
 * (block id OR page id), so a page id lists that page's top-level child blocks — we
 * reuse SMOKE_NOTION_PAGE_ID. Read-only, single page of results. The report asserts
 * only the terminal run status — never child-block content (bodies are user-typed).
 */
export default defineActionSmokeFixture({
  provider: "notion",
  action: "get_block_children",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { blockId: "SMOKE_NOTION_PAGE_ID" },
  requiredEnv: ["SMOKE_NOTION_CONNECTED", "SMOKE_NOTION_PAGE_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only Notion block-children list; needs a connected Notion + a block/page id " +
    "in SMOKE_NOTION_PAGE_ID (blockId is dual-meaning — a page id lists its children).",
});
