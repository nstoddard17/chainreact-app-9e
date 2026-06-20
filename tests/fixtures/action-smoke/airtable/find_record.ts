import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * airtable:find_record — read-only first-match lookup.
 *
 * Uses the explicit `TRUE()` formula (the schema's documented "first record"
 * idiom) so it matches the first row without any field knowledge. `find_record`
 * returns `{ found: false, record: null }` on no match rather than throwing, so
 * an empty table still succeeds. Read-only; report asserts only terminal status.
 */
export default defineActionSmokeFixture({
  provider: "airtable",
  action: "find_record",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { filterByFormula: "TRUE()" },
  configFromEnv: { baseId: "SMOKE_AIRTABLE_BASE_ID", tableIdOrName: "SMOKE_AIRTABLE_TABLE_ID" },
  requiredEnv: ["SMOKE_AIRTABLE_CONNECTED", "SMOKE_AIRTABLE_BASE_ID", "SMOKE_AIRTABLE_TABLE_ID"],
  expect: { outcome: "success" },
  notes: "Read-only find (TRUE() = first record); empty table still succeeds.",
});
