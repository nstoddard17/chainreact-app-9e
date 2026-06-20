import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * airtable:get_base_schema — read-only base structure (tables + fields metadata).
 *
 * Returns SCHEMA metadata (table/field names + types), not record content, so
 * it's safe to read. `includeViews` is required at the schema layer (no hidden
 * default) — set explicitly to false. The base id comes from
 * SMOKE_AIRTABLE_BASE_ID (overlaid onto config). SKIPs without Airtable env.
 */
export default defineActionSmokeFixture({
  provider: "airtable",
  action: "get_base_schema",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { includeViews: false },
  configFromEnv: { baseId: "SMOKE_AIRTABLE_BASE_ID" },
  requiredEnv: ["SMOKE_AIRTABLE_CONNECTED", "SMOKE_AIRTABLE_BASE_ID"],
  expect: { outcome: "success" },
  notes: "Read-only base schema metadata; needs a connected Airtable + base id.",
});
