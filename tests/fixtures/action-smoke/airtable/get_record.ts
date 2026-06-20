import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * airtable:get_record — read-only single-record fetch by id.
 *
 * Needs a base, table, and a specific record id (SMOKE_AIRTABLE_RECORD_ID), so it
 * SKIPs before workflow creation until a real record id is provided. Read-only —
 * the report asserts only the terminal run status, never the record content.
 */
export default defineActionSmokeFixture({
  provider: "airtable",
  action: "get_record",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    baseId: "SMOKE_AIRTABLE_BASE_ID",
    tableIdOrName: "SMOKE_AIRTABLE_TABLE_ID",
    recordId: "SMOKE_AIRTABLE_RECORD_ID",
  },
  requiredEnv: [
    "SMOKE_AIRTABLE_CONNECTED",
    "SMOKE_AIRTABLE_BASE_ID",
    "SMOKE_AIRTABLE_TABLE_ID",
    "SMOKE_AIRTABLE_RECORD_ID",
  ],
  expect: { outcome: "success" },
  notes: "Read-only single record by id; needs a real record id in SMOKE_AIRTABLE_RECORD_ID.",
});
