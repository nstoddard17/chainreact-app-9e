import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * airtable:list_records — read-only record listing (one page).
 *
 * Reads up to a small page of records from the smoke table. Read-only — the
 * report asserts only the terminal run status, never record content. Base +
 * table come from env. SKIPs without Airtable env.
 */
export default defineActionSmokeFixture({
  provider: "airtable",
  action: "list_records",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { pageSize: 10 },
  configFromEnv: { baseId: "SMOKE_AIRTABLE_BASE_ID", tableIdOrName: "SMOKE_AIRTABLE_TABLE_ID" },
  requiredEnv: ["SMOKE_AIRTABLE_CONNECTED", "SMOKE_AIRTABLE_BASE_ID", "SMOKE_AIRTABLE_TABLE_ID"],
  expect: { outcome: "success" },
  notes: "Read-only list (one small page); needs base + table id env.",
});
