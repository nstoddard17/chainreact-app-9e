import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — airtable:update_multiple_records (destructiveSafe, cleaned).
 *
 *   setup      create_multiple_records -> create 2 marker-"seed" records; capture
 *              BOTH ids (idsPath) into ledger keys record0 / record1
 *   execute    update_multiple_records -> rewrite each record's primary field to the
 *              marker-"updated" value, keyed on the captured ids
 *   verifyEach record (SMOKE READ-BACK) -> for EACH captured id, recordsList +
 *              RECORD_ID() returns that record's fields; assert the marker-"updated"
 *              value landed (markerSuffix "updated" — a "seed" record would fail, so
 *              this proves the UPDATE, independent of the update echo)
 *   cleanupEach delete_record -> delete EVERY captured record (REQUIRED)
 *
 * base / table from env; primary text field NAME auto-discovered by the dev test.
 * Operates ONLY on records THIS run created.
 */
export default defineWriteSmokeFixture({
  provider: "airtable",
  action: "update_multiple_records",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
    tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
    typecast: false,
    records: [
      {
        recordId: "{{ledger.record0.id}}",
        fields: { "{{env.SMOKE_AIRTABLE_TEXT_FIELD}}": { type: "singleLineText", value: "{{smokeMarker}}updated" } },
      },
      {
        recordId: "{{ledger.record1.id}}",
        fields: { "{{env.SMOKE_AIRTABLE_TEXT_FIELD}}": { type: "singleLineText", value: "{{smokeMarker}}updated" } },
      },
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
    setup: [
      {
        provider: "airtable",
        action: "create_multiple_records",
        config: {
          baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
          tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
          typecast: false,
          records: [
            { fields: { "{{env.SMOKE_AIRTABLE_TEXT_FIELD}}": { type: "singleLineText", value: "{{smokeMarker}}seedA" } } },
            { fields: { "{{env.SMOKE_AIRTABLE_TEXT_FIELD}}": { type: "singleLineText", value: "{{smokeMarker}}seedB" } } },
          ],
        },
        captureResource: { resourceKey: "record", idsPath: "records", idField: "id", kind: "record" },
      },
    ],
    // Per-record independent read-back: each record's persisted fields must contain
    // the marker-"updated" value (proves the update, not just our marker's presence).
    verifyEach: {
      provider: "airtable",
      action: "record",
      config: {
        baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
        tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
        recordId: "{{each.id}}",
      },
      markerPath: "fields",
      markerSuffix: "updated",
      smokeRead: true,
    },
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
    "PILOT — create 2 records -> update both -> read each back (marker-'updated') -> " +
    "delete each. Multi-resource setup capture + verifyEach/cleanupEach. destructiveSafe.",
});
