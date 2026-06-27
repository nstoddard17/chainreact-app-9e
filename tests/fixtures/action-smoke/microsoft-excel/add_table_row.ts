import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";
import { MINIMAL_XLSX_WITH_TABLE_BASE64 } from "@/tests/smoke-actions/minimalXlsx";

/**
 * microsoft-excel:add_table_row (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-42.
 *
 * `add_table_row` appends a row to a NAMED Excel table. There is no `create_table`
 * action or API wrapper, so the table cannot be built by a harness setup step — instead
 * the smoke uploads a workbook that ALREADY contains a defined table. A dedicated
 * table-bearing bootstrap asset (`MINIMAL_XLSX_WITH_TABLE_BASE64`) ships a `Sheet1` with a
 * table `SmokeTable` (one column `Col`, a header row + one benign non-marker seed row),
 * verified live-openable by Graph's table API (tables / columns / rows append+list). No
 * user/customer workbook is ever touched.
 *
 *   setup    onedrive:upload_file   -> upload the table-bearing workbook (marker FILENAME).
 *            Capture { itemId } into ledger key "workbook".
 *   execute  excel:add_table_row    -> append the positional row ["{{marker}}trow"] to the
 *            `SmokeTable` table. The handler's index/echo is never trusted.
 *   verify   excel:read_table_rows  -> INDEPENDENT read-back of the table rows; confirm the
 *            marker(+suffix "trow") is present among the persisted rows (the pre-seeded
 *            `seed` row has no marker, so a no-op append fails).
 *   cleanup  onedrive:delete_item   -> remove the WHOLE smoke workbook file (same OneDrive
 *            provider that created it — NOT cross-provider). A workbook-session lock right
 *            after the edit is absorbed by the bounded OneDrive delete retry.
 *
 * Verified-by-read-back, smoke-owned throughout, zero leaked. requiredEnv is the two
 * connection signals (Excel for the action under test; OneDrive for setup + cleanup).
 *
 * NOT live-certified yet — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP (`workflow_runs.status = "queued"` not yet in the DB enum). NOT_RUN_READY: authored
 * + offline-validated (the table asset itself was confirmed via a DIRECT-API probe, which does
 * not use the blocked engine path); cert deferred until the engine unblocks.
 *
 * HONESTY — `microsoft-onedrive:delete_item` moves the file to the RECYCLE BIN
 * (recoverable), not a hard erase; the object is gone from the active drive (get/list
 * then 404s), so the harness reports artifact "cleaned" and the cert note discloses the
 * recycle-bin semantics (same disclosure as the OneDrive write certs).
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-excel",
  action: "add_table_row",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    workbookId: "{{ledger.workbook.id}}",
    // The bootstrap asset defines this table; positional values aligned to the one "Col" column.
    tableName: "SmokeTable",
    values: ["{{smokeMarker}}trow"],
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_EXCEL_CONNECTED",
    "SMOKE_MICROSOFT_ONEDRIVE_CONNECTED",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "microsoft-onedrive",
        action: "upload_file",
        config: {
          filename: "{{smokeMarker}}workbook.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          content: MINIMAL_XLSX_WITH_TABLE_BASE64,
          contentEncoding: "base64",
        },
        captureResource: { resourceKey: "workbook", idPath: "itemId", kind: "workbook" },
      },
    ],
    // Independent read-back: read_table_rows returns the table's rows incl. the appended one.
    verify: {
      provider: "microsoft-excel",
      action: "read_table_rows",
      config: { workbookId: "{{ledger.workbook.id}}", tableName: "SmokeTable", top: 5 },
      markerPath: "rows",
      markerSuffix: "trow",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-onedrive",
      action: "delete_item",
      config: { itemId: "{{ledger.workbook.id}}" },
    },
  },
  notes:
    "SMOKE-WRITE-42 — upload a table-bearing minimal .xlsx (table 'SmokeTable', col 'Col', " +
    "seed row) via onedrive:upload_file -> excel:add_table_row appends ['{{marker}}trow'] -> " +
    "independent excel:read_table_rows read-back confirms the marker(+suffix trow) among the " +
    "rows (the seed lacks the marker, so a no-op fails) -> onedrive:delete_item removes the " +
    "whole file (recycle bin, recoverable). destructiveSafe. NOT live-certified yet " +
    "(durable-queue enum blocker); table asset validated via direct-API probe.",
});
