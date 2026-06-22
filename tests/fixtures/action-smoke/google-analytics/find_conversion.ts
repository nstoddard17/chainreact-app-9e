import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-analytics:find_conversion — read-only conversion-event lookup.
 *
 * Read-only (GA4 Admin API conversionEvents.list). Lists the property's
 * conversion events and matches by `conversionEventName` (free-text accepted at
 * runtime). A non-matching name still returns a successful run with
 * `found:false`. Property id comes from SMOKE_GA_PROPERTY_ID.
 */
export default defineActionSmokeFixture({
  provider: "google-analytics",
  action: "find_conversion",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {
    conversionEventName: "purchase",
  },
  configFromEnv: { propertyId: "SMOKE_GA_PROPERTY_ID" },
  requiredEnv: ["SMOKE_GOOGLE_ANALYTICS_CONNECTED", "SMOKE_GA_PROPERTY_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only conversion-event lookup; needs a connected GA + a property id in SMOKE_GA_PROPERTY_ID. A non-matching name is still a success (found:false).",
});
