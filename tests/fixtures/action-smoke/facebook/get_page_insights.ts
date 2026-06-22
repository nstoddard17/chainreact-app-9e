import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * facebook:get_page_insights — read-only Graph page insights.
 *
 * Reads one metric over a single-day window for the smoke page. pageId comes
 * from env; metric is a valid literal Graph metric. Read-only — the report
 * asserts only the terminal run status, never insight values.
 */
export default defineActionSmokeFixture({
  provider: "facebook",
  action: "get_page_insights",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { metric: "page_impressions", period: "day" },
  configFromEnv: { pageId: "SMOKE_FACEBOOK_PAGE_ID" },
  requiredEnv: ["SMOKE_FACEBOOK_CONNECTED", "SMOKE_FACEBOOK_PAGE_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Facebook page insights (page_impressions, day window) on the smoke page.",
});
