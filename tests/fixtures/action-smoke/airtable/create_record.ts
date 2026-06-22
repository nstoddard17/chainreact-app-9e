import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — airtable:create_record (destructiveSafe).
 *
 * The cleanest write-harness pilot shape: create a throwaway record, confirm it,
 * delete exactly that record. Fully reversible; the created id is captured into
 * the resource ledger and is the ONLY thing cleanup ever targets.
 *
 *   execute  create_record  -> capture { id } into ledger key "record"
 *   verify   get_record     -> confirm the record exists (keyed on {{ledger.record.id}})
 *   cleanup  delete_record  -> delete exactly the created record
 *
 * Gating (write harness): liveClass destructiveSafe needs
 * ALLOW_LIVE_PROVIDER_WRITE_SMOKE + ALLOW_DESTRUCTIVE_PROVIDER_SMOKE, plus a
 * connected Airtable on a DEDICATED smoke base/table.
 *
 * NOT registered in ALL_SMOKE_FIXTURES and NOT run live this slice. Sub-step
 * `{{env.*}}` tokens are resolved by the (deferred) real WriteHarnessDeps wiring;
 * `{{smokeMarker}}` + `{{ledger.*}}` are resolved by the pure orchestrator.
 */
export default defineWriteSmokeFixture({
  provider: "airtable",
  action: "create_record",
  risk: "write",
  liveRisk: "write",
  // Not liveSafe in the read sense — the write harness owns its live gating.
  liveSafe: false,
  config: {
    typecast: false,
    fields: { Name: { type: "singleLineText", value: "{{smokeMarker}}pilot" } },
    // baseId / tableIdOrName overlaid from env at run time (never hardcoded).
  },
  configFromEnv: { baseId: "SMOKE_AIRTABLE_BASE_ID", tableIdOrName: "SMOKE_AIRTABLE_TABLE_ID" },
  requiredEnv: ["SMOKE_AIRTABLE_CONNECTED", "SMOKE_AIRTABLE_BASE_ID", "SMOKE_AIRTABLE_TABLE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "record", idPath: "id", kind: "record" },
    verify: {
      provider: "airtable",
      action: "get_record",
      config: {
        baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
        tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
        recordId: "{{ledger.record.id}}",
      },
    },
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
    "PILOT (not registered, not run live): create -> get -> delete a throwaway " +
    "record. Point at a DEDICATED smoke base/table. destructiveSafe — needs the " +
    "write + destructive gates.",
});
