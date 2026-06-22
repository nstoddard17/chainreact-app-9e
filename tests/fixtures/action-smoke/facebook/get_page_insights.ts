import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * facebook:get_page_insights — read-only Graph page insights.
 *
 * Reads one metric over a single-day window for the smoke page. pageId is
 * auto-discovered (SMOKE-ACTIONS-19) or pinned via env; metric is a currently
 * VALID page-level Graph metric. Read-only — the report asserts only the
 * terminal run status, never insight values.
 *
 * Metric choice: `page_post_engagements`. Meta's 2024 Page Insights deprecation
 * removed the whole `page_impressions*` / `page_fans` / `page_engaged_users`
 * family, so requesting those now returns `(#100) The value must be a valid
 * insights metric` on Graph v23.0. `page_post_engagements` is a core, stable,
 * universally-available page metric that survives the deprecation (live-verified
 * on the smoke page, day window).
 */
export default defineActionSmokeFixture({
  provider: "facebook",
  action: "get_page_insights",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { metric: "page_post_engagements", period: "day" },
  configFromEnv: { pageId: "SMOKE_FACEBOOK_PAGE_ID" },
  requiredEnv: ["SMOKE_FACEBOOK_CONNECTED", "SMOKE_FACEBOOK_PAGE_ID"],
  expect: { outcome: "success" },
  notes: "Read-only Facebook page insights (page_post_engagements, day window) on the smoke page.",
});
