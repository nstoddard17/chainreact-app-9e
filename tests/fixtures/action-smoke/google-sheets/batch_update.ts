import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-sheets:batch_update (destructiveSafe, cleaned — CROSS-PROVIDER) — SMOKE-WRITE-30.
 *
 * batch_update is NOT a raw/arbitrary Sheets `requests[]` passthrough (V1's raw mode
 * is rejected at parse time). It is a TYPED multi-range VALUE write
 * (`spreadsheets.values.batchUpdate`, `updates: Array<{range, values}>`). So the
 * narrowest deterministic request — ONE entry writing ONE cell — is exactly an
 * `update_cell` shaped through the batch path, and is verifiable the same way.
 *
 *   setup    create_spreadsheet -> create a WHOLE smoke-owned spreadsheet (pinned
 *            first sheet "Data"). Capture { spreadsheetId } into ledger key "sheet".
 *            The sheet starts EMPTY, so A1 is deterministically blank before the write.
 *   execute  batch_update       -> ONE update entry writing "<marker>batch" to the
 *            SINGLE cell Data!A1 (RAW). The handler's `responses`/`totalUpdated*` are
 *            structural counters / write echoes, never trusted as proof.
 *   verify   get_cell_value     -> READ-BACK Data!A1 and confirm the marker on the
 *            PERSISTED `value` (markerSuffix "batch" -> "<marker>batch"). Independent
 *            read of the live cell; only our write could place this unique marker in a
 *            freshly-created empty sheet.
 *   cleanup  google-drive:delete_file (permanent) -> delete the WHOLE smoke spreadsheet
 *            (spreadsheetId IS a Drive file id; Sheets has no own delete). CROSS-PROVIDER,
 *            declared via `crossProviderCleanup: true`.
 *
 * Safety: a single bounded one-cell write inside a freshly-created smoke spreadsheet,
 * then the whole artifact is permanently deleted — never a pre-existing / shared sheet,
 * no broad multi-op request. requiredEnv is only the connection signal.
 */
export default defineWriteSmokeFixture({
  provider: "google-sheets",
  action: "batch_update",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    spreadsheetId: "{{ledger.sheet.id}}",
    valueInputOption: "RAW",
    // Exactly ONE entry, ONE cell — the narrowest deterministic batch request.
    updates: [{ range: "Data!A1", values: [["{{smokeMarker}}batch"]] }],
  },
  requiredEnv: ["SMOKE_GOOGLE_SHEETS_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    crossProviderCleanup: true,
    setup: [
      {
        provider: "google-sheets",
        action: "create_spreadsheet",
        config: { title: "{{smokeMarker}}sheet", initialSheetName: "Data" },
        captureResource: { resourceKey: "sheet", idPath: "spreadsheetId", kind: "spreadsheet" },
      },
    ],
    verify: {
      provider: "google-sheets",
      action: "get_cell_value",
      config: { spreadsheetId: "{{ledger.sheet.id}}", sheetName: "Data", cell: "A1" },
      markerPath: "value",
      markerSuffix: "batch",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.sheet.id}}", permanent: true },
    },
  },
  notes:
    "SMOKE-WRITE-30 — create smoke spreadsheet (pinned 'Data') -> batch_update ONE " +
    "entry Data!A1=<marker>batch (RAW) -> get_cell_value A1 read-back marker(+suffix " +
    "batch) on value -> google-drive:delete_file (cross-provider, permanent). " +
    "Typed value-write, narrowest one-op request. destructiveSafe.",
});
