import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * notion:get_page — read-only single-page metadata/properties.
 *
 * Fetches one page's object + parsed properties. The page id comes from
 * SMOKE_NOTION_PAGE_ID (overlaid onto config), so it SKIPs before workflow
 * creation until provided. Read-only. The report asserts only the terminal
 * run status — never page titles, properties, or block content.
 */
export default defineActionSmokeFixture({
  provider: "notion",
  action: "get_page",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { pageId: "SMOKE_NOTION_PAGE_ID" },
  requiredEnv: ["SMOKE_NOTION_CONNECTED", "SMOKE_NOTION_PAGE_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only Notion page metadata/properties; needs a connected Notion + a page id in SMOKE_NOTION_PAGE_ID.",
});
