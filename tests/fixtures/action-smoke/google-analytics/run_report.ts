import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-analytics:run_report — read-only GA4 report (bounded metrics/dims).
 *
 * Read-only (GA4 Data API runReport). `dateRange` is a preset enum
 * (last_7_days) so no custom start/end needed; `metrics`/`dimensions` are
 * string arrays. The property id comes from SMOKE_GA_PROPERTY_ID. The report
 * asserts only the terminal run status, never row content (rows are sensitive).
 */
export default defineActionSmokeFixture({
  provider: "google-analytics",
  action: "run_report",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {
    dateRange: "last_7_days",
    metrics: ["activeUsers"],
    dimensions: ["date"],
    limit: 10,
  },
  configFromEnv: { propertyId: "SMOKE_GA_PROPERTY_ID" },
  requiredEnv: ["SMOKE_GOOGLE_ANALYTICS_CONNECTED", "SMOKE_GA_PROPERTY_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only GA4 report; needs a connected GA + a property id in SMOKE_GA_PROPERTY_ID.",
});
