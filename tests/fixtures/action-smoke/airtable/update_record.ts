import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — airtable:update_record (destructiveSafe, cleaned).
 *
 *   setup    create_record -> capture { id } into ledger key "record" (marker-seed)
 *   execute  update_record -> rewrite the primary field to the marker-"updated" value
 *   verify   marker echo on the update output's fields
 *   cleanup  delete_record -> delete exactly the smoke-created record (REQUIRED)
 *
 * Operates ONLY on a record THIS run created (never a pre-existing one). The field
 * NAME and base/table come from env so the pilot is portable to any dedicated
 * smoke base. NOT registered in the read runner; runs via the write harness.
 */
export default defineWriteSmokeFixture({
  provider: "airtable",
  action: "update_record",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    typecast: false,
    recordId: "{{ledger.record.id}}",
    fields: {
      "{{env.SMOKE_AIRTABLE_TEXT_FIELD}}": { type: "singleLineText", value: "{{smokeMarker}}updated" },
    },
  },
  configFromEnv: { baseId: "SMOKE_AIRTABLE_BASE_ID", tableIdOrName: "SMOKE_AIRTABLE_TABLE_ID" },
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
        action: "create_record",
        config: {
          typecast: false,
          baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
          tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
          fields: {
            "{{env.SMOKE_AIRTABLE_TEXT_FIELD}}": { type: "singleLineText", value: "{{smokeMarker}}seed" },
          },
        },
        captureResource: { resourceKey: "record", idPath: "id", kind: "record" },
      },
    ],
    // update_record echoes the stored fields; confirm the updated marker landed.
    markerEchoPath: "fields.{{env.SMOKE_AIRTABLE_TEXT_FIELD}}",
    cleanupKind: "delete",
    cleanup: {
      provider: "airtable",
      action: "delete_record",
      config: {
        baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
        tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
        recordId: "{{ledger.record.id}}",
      },
    },
  },
  notes:
    "PILOT — create -> update -> verify -> delete a throwaway record on a dedicated " +
    "smoke base. destructiveSafe; cleanup REQUIRED.",
});
