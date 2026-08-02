import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { worksheetUsedRange } from "../api/worksheetUsedRange";
import { worksheetRangePatch } from "../api/worksheetRangePatch";
import { UpdateRowConfigSchema } from "./updateRow.schema";

/**
 * Excel `update_row` action handler.
 *
 * Microsoft Excel parity Commit 1. Updates specific cells in a known
 * row of a worksheet, addressing columns by header name. Algorithm:
 *
 *   1. GET worksheet usedRange (values only) — gives us both the
 *      header row (row 1) and any existing values for the target row.
 *      One Graph round-trip serves both purposes (P-X1 accepted
 *      handler-internal header read).
 *   2. Build a header→columnIndex map from row 1. Validate every
 *      `values` key is in the map; fail loudly on unknown column
 *      (no silent skip — Marcus acceptance).
 *   3. Merge: start with the existing row's values (preserves
 *      untouched cells); overlay the supplied updates at their
 *      resolved column indices.
 *   4. PATCH the full row range with the merged values. Single
 *      Graph round-trip regardless of how many columns are updated
 *      (V1 issued one PATCH per cell — N HTTP calls per row update;
 *      V2 does 2 round-trips total).
 *
 * TWO FAIL-CLOSED GUARDS (SPREADSHEET-GUIDED-CONFIG-S3). Both run before
 * any PATCH is issued, because the failure they prevent is a write to a
 * customer's live spreadsheet:
 *
 *   - **The heading row is never a target.** Row 1 of the used range is
 *     what every column name is resolved against, so updating it renames
 *     the user's columns and breaks every workflow pointed at that sheet.
 *     The schema's minimum stops the ordinary path; this check stops
 *     anything that reaches the handler another way.
 *   - **The row must already exist.** This handler's own comment used to
 *     claim it threw for a row beyond the used range. It did not: the
 *     merge fell back to an empty row, every unconfigured column became
 *     `null`, and the PATCH wrote that. So "update row 500" on a
 *     four-row sheet silently CREATED a null-filled row 500. Update Row
 *     must not quietly become Add Row, so an out-of-range target is now
 *     an error and no PATCH is issued.
 *
 * If the row IS in range but a column key doesn't match any header, we
 * throw — no silent skip, no silent create.
 *
 * ROW INDEXING. Graph returns the used range's absolute address
 * (`"Sheet1!A3:D9"`), and it does NOT have to start at row 1. The row
 * offset is therefore computed from that address rather than assumed to
 * be `rowNumber - 1`. For the ordinary sheet that starts at row 1 the
 * arithmetic is identical; for one that starts lower, the previous
 * assumption read a DIFFERENT row's values into the merge and wrote them
 * to the target.
 *
 * KNOWN LIMITATION, unchanged here: the merged row is written from column
 * A, while the header indices come from the used range, which may start
 * at a later column. A worksheet whose content starts at column B is
 * therefore still written one or more columns to the left. That is
 * pre-existing behavior with its own migration question (it changes where
 * live workflows write), and it is deliberately out of scope for this
 * slice rather than half-fixed here.
 *
 * Output: `{ workbookId, worksheetName, rowNumber, address,
 * columnsUpdated, updatedColumns }` — `address` is the A1 range
 * actually written; `updatedColumns` is the list of header names
 * resolved (in source order from `values`).
 *
 * `address` always covers `A{row}:{lastHeaderCol}{row}` so the FULL
 * row gets re-PATCHed with merged values — guarantees no cells get
 * blanked out by a partial range PATCH.
 */
export const updateRow: ActionHandler = async (input) => {
  const config = UpdateRowConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.providerAccountId
      : null;

  const used = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-excel",
    providerAccountId,
    apiCall: (accessToken) =>
      worksheetUsedRange({
        accessToken,
        workbookId: config.workbookId,
        worksheetName: config.worksheetName,
        valuesOnly: true,
      }),
  });

  const rows = used.values;
  if (!rows || rows.length === 0) {
    throw new Error(
      `update_row: worksheet '${config.worksheetName}' has no usedRange — cannot resolve column headers.`,
    );
  }

  const headerRow = rows[0] ?? [];
  const headerIndex = new Map<string, number>();
  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i];
    if (typeof h === "string" && h.length > 0) {
      headerIndex.set(h, i);
    }
  }

  // Fail loudly on unknown columns — no silent skip, no silent create.
  const requestedColumns = Object.keys(config.values);
  const unknown = requestedColumns.filter((c) => !headerIndex.has(c));
  if (unknown.length > 0) {
    throw new Error(
      `update_row: column(s) not found in worksheet headers: ${unknown.map((c) => `'${c}'`).join(", ")}. Available columns: ${headerRow.filter((h) => typeof h === "string").map((h) => `'${h}'`).join(", ") || "(none)"}.`,
    );
  }

  const columnCount = headerRow.length;

  // ── Fail-closed guards, both BEFORE any write ──────────────────────────
  // The used range's first row is the heading row, wherever that range
  // actually starts.
  const startRow = usedRangeStartRow(used.address ?? "");
  const headingRowNumber = startRow;

  if (config.rowNumber <= headingRowNumber) {
    throw new Error(
      `update_row: row ${config.rowNumber} is the heading row of worksheet '${config.worksheetName}' — it holds the column names this step matches against, so updating it would rename your columns. Choose a row from ${headingRowNumber + 1} onwards.`,
    );
  }

  const rowIndex = config.rowNumber - startRow;
  if (rowIndex < 0 || rowIndex >= rows.length) {
    const lastRow = startRow + rows.length - 1;
    throw new Error(
      `update_row: row ${config.rowNumber} does not exist in worksheet '${config.worksheetName}' — it currently has data through row ${lastRow}. Update Row only changes a row that is already there; it never creates one. Check the row number, or add the row first.`,
    );
  }

  const existingRow = rows[rowIndex] ?? [];

  const merged: unknown[] = [];
  for (let i = 0; i < columnCount; i++) {
    merged.push(i < existingRow.length ? (existingRow[i] ?? null) : null);
  }
  for (const [columnName, value] of Object.entries(config.values)) {
    const idx = headerIndex.get(columnName);
    if (idx === undefined) continue; // already caught above; defensive.
    merged[idx] = value;
  }

  const startCol = "A";
  const endCol = columnLetter(columnCount);
  const address = `${startCol}${config.rowNumber}:${endCol}${config.rowNumber}`;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-excel",
    providerAccountId,
    apiCall: (accessToken) =>
      worksheetRangePatch({
        accessToken,
        workbookId: config.workbookId,
        worksheetName: config.worksheetName,
        address,
        values: [merged],
      }),
  });

  return {
    output: {
      workbookId: config.workbookId,
      worksheetName: config.worksheetName,
      rowNumber: config.rowNumber,
      address,
      columnsUpdated: requestedColumns.length,
      updatedColumns: requestedColumns,
    },
  };
};

/**
 * 1-based row number of the used range's FIRST row, parsed from its A1
 * address (`"Sheet1!B3:D9"` → 3). Unparseable → 1 (assume the sheet starts
 * at the top), which is the arithmetic this handler always used and keeps
 * the ordinary case byte-identical.
 */
function usedRangeStartRow(address: string): number {
  const local = address.includes("!")
    ? address.slice(address.lastIndexOf("!") + 1)
    : address;
  const start = local.includes(":") ? local.slice(0, local.indexOf(":")) : local;
  const match = /^[A-Za-z]+(\d+)$/.exec(start);
  if (!match) return 1;
  const parsed = Number.parseInt(match[1]!, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

function columnLetter(n: number): string {
  if (n < 1) return "A";
  let result = "";
  let remaining = n;
  while (remaining > 0) {
    const rem = (remaining - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}
