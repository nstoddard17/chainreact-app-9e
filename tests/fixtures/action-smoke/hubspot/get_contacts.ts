import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:get_contacts — read-only contacts list (metadata, one small page).
 *
 * Needs only a connected HubSpot account; no selectors. The smoke report
 * asserts only the terminal run status — never contact PII.
 */
export default defineActionSmokeFixture({
  provider: "hubspot",
  action: "get_contacts",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 10 },
  requiredEnv: ["SMOKE_HUBSPOT_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only HubSpot contacts list (one page, max 10); needs only SMOKE_HUBSPOT_CONNECTED.",
});
