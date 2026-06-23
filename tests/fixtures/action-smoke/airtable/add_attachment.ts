import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — airtable:add_attachment (destructiveSafe, cleaned).
 *
 *   setup    create_record  -> capture { id } (marker-seed in the primary text field)
 *   execute  add_attachment -> attach a throwaway file to the smoke record's
 *            attachment field. The file is a v2_storage FileRef pointing at a tiny
 *            PNG staged by the dev test in OUR workflow-files bucket (the handler
 *            mints a short-lived signed URL Airtable fetches) — a SELF-CONTAINED
 *            source, never an invented external URL.
 *   verify   record (SMOKE READ-BACK) -> recordsList + RECORD_ID() returns the
 *            record's fields; assert the attachment field is now a NON-EMPTY array
 *            whose every element carries a stable `id`. The marker text can NOT be
 *            used — Airtable REHOSTS the file (our URL/filename are replaced) — so a
 *            populated array of `{id,...}` is the strongest honest, independent proof
 *            (never the add_attachment echo).
 *   cleanup  delete_record  -> delete exactly the smoke-created record (REQUIRED).
 *            The staged file is removed by the dev test.
 *
 * base / table from env; the primary text field + attachment field NAMES and the
 * staged file's storage path are resolved by the dev test (auto-discovered /
 * staged). When the table has no attachment field OR no file was staged the run is
 * BLOCKED_ENV (SMOKE_AIRTABLE_ATTACHMENT_FIELD / SMOKE_AIRTABLE_ATTACHMENT_STORAGE_PATH).
 */
export default defineWriteSmokeFixture({
  provider: "airtable",
  action: "add_attachment",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
    tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
    recordId: "{{ledger.record.id}}",
    fieldName: "{{env.SMOKE_AIRTABLE_ATTACHMENT_FIELD}}",
    file: {
      kind: "v2_storage",
      name: "{{smokeMarker}}attach.png",
      mimeType: "image/png",
      storagePath: "{{env.SMOKE_AIRTABLE_ATTACHMENT_STORAGE_PATH}}",
    },
  },
  requiredEnv: [
    "SMOKE_AIRTABLE_CONNECTED",
    "SMOKE_AIRTABLE_BASE_ID",
    "SMOKE_AIRTABLE_TABLE_ID",
    "SMOKE_AIRTABLE_TEXT_FIELD",
    "SMOKE_AIRTABLE_ATTACHMENT_FIELD",
    "SMOKE_AIRTABLE_ATTACHMENT_STORAGE_PATH",
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
    // Independent read-back: the attachment field is now a non-empty array, each
    // element carrying a stable Airtable attachment id (marker text can't survive
    // Airtable's rehosting, so this is the strongest honest proof).
    verify: {
      provider: "airtable",
      action: "record",
      config: {
        baseId: "{{env.SMOKE_AIRTABLE_BASE_ID}}",
        tableIdOrName: "{{env.SMOKE_AIRTABLE_TABLE_ID}}",
        recordId: "{{ledger.record.id}}",
      },
      expectNonEmptyArray: { path: "fields.{{env.SMOKE_AIRTABLE_ATTACHMENT_FIELD}}", elementHasKey: "id" },
      smokeRead: true,
    },
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
    "PILOT — create record -> attach staged PNG (v2_storage) -> read-back attachment " +
    "field non-empty (each {id}) -> delete record. Self-contained file (our bucket), " +
    "no invented URL. destructiveSafe.",
});
