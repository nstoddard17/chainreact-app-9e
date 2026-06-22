import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:get_line_items — read-only line items list (metadata, one small page).
 *
 * The line_items search endpoint needs only a connected HubSpot account — no
 * deal id or other selector is required by the schema. The smoke report asserts
 * only the terminal run status — never line-item data.
 */
export default defineActionSmokeFixture({
  provider: "hubspot",
  action: "get_line_items",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { limit: 10 },
  requiredEnv: ["SMOKE_HUBSPOT_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only HubSpot line items list (one page, max 10); needs only SMOKE_HUBSPOT_CONNECTED.",
});
