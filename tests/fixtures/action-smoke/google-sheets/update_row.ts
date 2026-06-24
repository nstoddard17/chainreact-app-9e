import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-sheets:update_row (destructiveSafe, cleaned — CROSS-PROVIDER) — SMOKE-WRITE-27.
 *
 *   setup    create_spreadsheet -> create a WHOLE smoke-owned spreadsheet (pinned
 *            first sheet "Data"). Capture { spreadsheetId } into ledger key "sheet".
 *            append_row         -> SEED row 1 with "<marker>seed" so the update has a
 *            DISTINCT prior value to overwrite (proves the update is not a no-op).
 *   execute  update_row         -> overwrite the EXACT range Data!A1:B1 with
 *            "<marker>updated" (RAW). The handler's `updatedRange`/counts are echoes,
 *            never trusted.
 *   verify   get_cell_value     -> READ-BACK Data!A1 and confirm the marker on the
 *            PERSISTED `value` with markerSuffix "updated" -> requires
 *            "<marker>updated". The seed wrote "<marker>seed", so a no-op update would
 *            still read "seed" and FAIL — this proves the overwrite actually landed.
 *   cleanup  google-drive:delete_file (permanent) -> delete the WHOLE smoke spreadsheet
 *            (spreadsheetId IS a Drive file id). CROSS-PROVIDER, declared.
 *
 * Safety: seed + overwrite happen entirely inside a freshly-created smoke
 * spreadsheet at a FIXED range, then the whole artifact is permanently deleted —
 * never a pre-existing/shared sheet. requiredEnv is only the connection signal.
 */
export default defineWriteSmokeFixture({
  provider: "google-sheets",
  action: "update_row",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    spreadsheetId: "{{ledger.sheet.id}}",
    range: "Data!A1:B1",
    values: ["{{smokeMarker}}updated", "y"],
    valueInputOption: "RAW",
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
      {
        // Seed row 1 with a DISTINCT prior value so the update is provably a change.
        provider: "google-sheets",
        action: "append_row",
        config: {
          spreadsheetId: "{{ledger.sheet.id}}",
          range: "Data!A:Z",
          values: ["{{smokeMarker}}seed"],
          valueInputOption: "RAW",
        },
      },
    ],
    verify: {
      provider: "google-sheets",
      action: "get_cell_value",
      config: { spreadsheetId: "{{ledger.sheet.id}}", sheetName: "Data", cell: "A1" },
      markerPath: "value",
      markerSuffix: "updated",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.sheet.id}}", permanent: true },
    },
  },
  notes:
    "SMOKE-WRITE-27 — create smoke spreadsheet (pinned 'Data') + seed A1=<marker>seed " +
    "-> update_row A1:B1=<marker>updated (RAW) -> get_cell_value A1 read-back " +
    "marker(+suffix updated) on value (seed would fail) -> google-drive:delete_file " +
    "(cross-provider, permanent). destructiveSafe.",
});
