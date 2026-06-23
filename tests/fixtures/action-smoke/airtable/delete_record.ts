import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — airtable:delete_record (destructiveSafe, execute IS the cleanup).
 *
 * delete_record is exercised today only as the CLEANUP of create_record — nothing
 * certifies it as an action OR proves the record is actually gone. This does both,
 * and ONLY ever deletes a record THIS run created.
 *
 *   setup    create_record -> capture { id } into ledger key "record" (marker-seed
 *                             in the smoke table's primary text field)
 *   execute  delete_record -> delete exactly the ledger-created record
 *   verify   record (SMOKE READ-BACK) -> recordsGet maps a 404 to { exists:false };
 *            assert exists == false. The delete response (`{deleted:true}`) is NOT
 *            trusted — deletion is proven by the record being GONE on an independent
 *            read-back (a 404 ONLY, never an auth/network error -> false positive).
 *   (executeIsCleanup)        the delete IS the disposition: the smoke record is
 *            removed. artifact "cleaned" — nothing left behind.
 *
 * base / table from env (DEDICATED smoke base/table); the primary text field NAME
 * is auto-discovered by the dev test (SMOKE_AIRTABLE_TEXT_FIELD).
 */
export default defineWriteSmokeFixture({
  provider: "airtable",
  action: "delete_record",
  // "delete" is an obviously-destructive verb -> risk/liveRisk MUST be destructive
  // (the write harness still gates via liveClass: destructiveSafe). Never liveSafe.
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
    tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
    recordId: "{{ledger.record.id}}",
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
        action: "create_record",
        config: {
          baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
          tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
          typecast: false,
          fields: {
            "{{env.SMOKE_AIRTABLE_TEXT_FIELD}}": { type: "singleLineText", value: "{{smokeMarker}}seed" },
          },
        },
        captureResource: { resourceKey: "record", idPath: "id", kind: "record" },
      },
    ],
    // Independent existence probe via the smoke-only seam: a deleted record 404s ->
    // exists:false. Proves the side effect rather than trusting `{deleted:true}`.
    verify: {
      provider: "airtable",
      action: "record",
      config: {
        baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
        tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
        recordId: "{{ledger.record.id}}",
      },
      expectEquals: { path: "exists", value: false },
      smokeRead: true,
    },
    // The action under test IS the disposition — no separate cleanup; artifact "cleaned".
    executeIsCleanup: true,
  },
  notes:
    "PILOT — create record -> delete it -> READ-BACK exists==false (smoke seam, 404 " +
    "only). executeIsCleanup: the record is gone (artifact cleaned). destructiveSafe.",
});
