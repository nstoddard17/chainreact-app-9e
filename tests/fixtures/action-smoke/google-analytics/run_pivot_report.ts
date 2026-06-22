import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-analytics:run_pivot_report — read-only GA4 pivot report.
 *
 * Read-only (GA4 Data API runPivotReport). Like run_report plus
 * `pivotDimensions` (column dimensions). `dateRange` is the preset enum, so no
 * custom start/end needed. Property id comes from SMOKE_GA_PROPERTY_ID. The
 * report asserts only the terminal run status, never row content.
 */
export default defineActionSmokeFixture({
  provider: "google-analytics",
  action: "run_pivot_report",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {
    dateRange: "last_7_days",
    metrics: ["activeUsers"],
    dimensions: ["date"],
    pivotDimensions: ["country"],
    limit: 10,
  },
  configFromEnv: { propertyId: "SMOKE_GA_PROPERTY_ID" },
  requiredEnv: ["SMOKE_GOOGLE_ANALYTICS_CONNECTED", "SMOKE_GA_PROPERTY_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only GA4 pivot report; needs a connected GA + a property id in SMOKE_GA_PROPERTY_ID.",
});
