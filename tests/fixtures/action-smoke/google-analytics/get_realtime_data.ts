import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-analytics:get_realtime_data — read-only GA4 realtime report.
 *
 * Read-only (GA4 Data API runRealtimeReport). No date range — realtime only.
 * `metrics`/`dimensions` are string arrays. Property id comes from
 * SMOKE_GA_PROPERTY_ID. The report asserts only the terminal run status, never
 * row content.
 */
export default defineActionSmokeFixture({
  provider: "google-analytics",
  action: "get_realtime_data",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {
    metrics: ["activeUsers"],
    dimensions: ["country"],
    limit: 10,
  },
  configFromEnv: { propertyId: "SMOKE_GA_PROPERTY_ID" },
  requiredEnv: ["SMOKE_GOOGLE_ANALYTICS_CONNECTED", "SMOKE_GA_PROPERTY_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only GA4 realtime report; needs a connected GA + a property id in SMOKE_GA_PROPERTY_ID.",
});
