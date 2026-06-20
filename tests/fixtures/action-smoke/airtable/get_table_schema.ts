import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * airtable:get_table_schema — read-only single-table structure (fields metadata).
 *
 * Returns field metadata (names + types) for one table — not record content, so
 * it's safe to read. `includeViews` is required at the schema layer (no hidden
 * default) — set explicitly to false. Base + table come from env. SKIPs without
 * Airtable env.
 */
export default defineActionSmokeFixture({
  provider: "airtable",
  action: "get_table_schema",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { includeViews: false },
  configFromEnv: { baseId: "SMOKE_AIRTABLE_BASE_ID", tableIdOrName: "SMOKE_AIRTABLE_TABLE_ID" },
  requiredEnv: ["SMOKE_AIRTABLE_CONNECTED", "SMOKE_AIRTABLE_BASE_ID", "SMOKE_AIRTABLE_TABLE_ID"],
  expect: { outcome: "success" },
  notes: "Read-only table schema metadata; needs base + table id env.",
});
