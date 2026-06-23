import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — airtable:create_multiple_records (destructiveSafe, cleaned).
 *
 * The first MULTI-resource write pilot — exercises the harness's array capture +
 * per-id verifyEach / cleanupEach fan-out.
 *
 *   execute    create_multiple_records -> create 2 marker-stamped records; capture
 *              BOTH ids (idsPath "records") into ledger keys record0 / record1
 *   verifyEach record (SMOKE READ-BACK) -> for EACH captured id, recordsList +
 *              RECORD_ID() returns that record's fields; assert the run marker is
 *              present (independent read-back, NOT the create echo)
 *   cleanupEach delete_record -> delete EVERY captured record (REQUIRED). Partial
 *              cleanup is never PASS_CLEANED.
 *
 * base / table from env; the primary text field NAME is auto-discovered by the dev
 * test (SMOKE_AIRTABLE_TEXT_FIELD). Operates ONLY on records THIS run created.
 */
export default defineWriteSmokeFixture({
  provider: "airtable",
  action: "create_multiple_records",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
    tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
    typecast: false,
    records: [
      { fields: { "{{env.SMOKE_AIRTABLE_TEXT_FIELD}}": { type: "singleLineText", value: "{{smokeMarker}}multi-a" } } },
      { fields: { "{{env.SMOKE_AIRTABLE_TEXT_FIELD}}": { type: "singleLineText", value: "{{smokeMarker}}multi-b" } } },
    ],
  },
  requiredEnv: [
    "SMOKE_AIRTABLE_CONNECTED",
    "SMOKE_AIRTABLE_BASE_ID",
    "SMOKE_AIRTABLE_TABLE_ID",
    "SMOKE_AIRTABLE_TEXT_FIELD",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    // MULTI capture: each created record's id -> ledger key record0 / record1.
    captureResource: { resourceKey: "record", idsPath: "records", idField: "id", kind: "record" },
    // Per-record independent read-back: each captured record's persisted fields
    // must contain the run marker.
    verifyEach: {
      provider: "airtable",
      action: "record",
      config: {
        baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
        tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
        recordId: "{{each.id}}",
      },
      markerPath: "fields",
      smokeRead: true,
    },
    // Per-record REQUIRED cleanup — delete each created record.
    cleanupKind: "delete",
    cleanupEach: {
      provider: "airtable",
      action: "delete_record",
      config: {
        baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
        tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
        recordId: "{{each.id}}",
      },
    },
  },
  notes:
    "PILOT — create 2 records -> read each back (marker) -> delete each. First " +
    "multi-resource fixture (array capture + verifyEach/cleanupEach). destructiveSafe.",
});
