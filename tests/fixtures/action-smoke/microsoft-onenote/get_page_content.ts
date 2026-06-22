import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onenote:get_page_content — read-only page fetch (metadata + HTML body).
 *
 * Returns the page HTML body as JSON (NOT raw file bytes), so it is smoke-safe;
 * the report asserts only the terminal run status, never the page content. Needs
 * a page id (SMOKE_ONENOTE_PAGE_ID), so it SKIPs before workflow creation until a
 * real id is provided.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-onenote",
  action: "get_page_content",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    pageId: "SMOKE_ONENOTE_PAGE_ID",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONENOTE_CONNECTED", "SMOKE_ONENOTE_PAGE_ID"],
  expect: { outcome: "success" },
  notes: "Read-only page content (HTML body via JSON, not raw bytes) by id; needs a real page id in SMOKE_ONENOTE_PAGE_ID.",
});
