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
 *   1. GET worksheet usedRange (values only) — gives us the header row,
 *      the used range's real start row, and whether the target row
 *      exists. One Graph round-trip serves all three (P-X1 accepted
 *      handler-internal header read).
 *   2. Build a header→columnIndex map from row 1. Validate every
 *      `values` key is in the map; fail loudly on unknown column
 *      (no silent skip — Marcus acceptance).
 *   3. Build a SPARSE row: every position `null`, then the chosen
 *      columns filled in at their resolved indices.
 *   4. PATCH the row range once. Two Graph round-trips total,
 *      regardless of how many columns change (V1 issued one PATCH per
 *      cell — N HTTP calls per row update).
 *
 * SPARSE WRITE (EXCEL-UPDATE-ROW-CONCURRENCY-4). Step 3 used to seed the
 * payload with the values read in step 1 and overlay the changes on top.
 * That is what made this action able to destroy other people's work: the
 * row it wrote was a faithful copy of a snapshot that could already be
 * stale, so an edit made by a colleague between the read and the write was
 * silently reverted. There is no fix for that at the request level —
 * Microsoft documents no ETag, no If-Match and no conditional header for
 * this endpoint, and workbook sessions are persistence and performance, not
 * locking (see docs/slices/phase-5/spreadsheet-guided-config/
 * s4-excel-concurrency-plan.md).
 *
 * The fix is to stop sending those cells at all. Microsoft documents that a
 * `null` inside the values array is an instruction to leave the cell alone:
 *
 *     "null input inside a two-dimensional array (for values,
 *      number-format, formula) is ignored in the Range and Table
 *      resources. No update takes place to the intended target (cell)
 *      when null input is sent."
 *     — https://learn.microsoft.com/en-us/graph/api/resources/excel
 *
 * and that a blank string is an instruction to clear it ("For `values`, the
 * range value is cleared out"). Those two rules map exactly onto the three
 * states the guided editor already saves:
 *
 *     key absent   → `null`  → cell untouched
 *     key = ""     → `""`    → cell cleared
 *     key = value  → value   → cell written
 *
 * So ChainReact now writes only what the user asked it to write. A
 * concurrent edit to any other column of that row cannot be overwritten,
 * because those cells are not in the request. The read is still required —
 * for the header map, the heading-row guard and the row-existence guard —
 * but it no longer feeds the payload, so its staleness stops mattering.
 *
 * This also stops a quieter kind of damage. `valuesOnly: true` returns
 * CALCULATED values, so the old merge read a formula cell back as its
 * result and rewrote it as a literal — destroying the formula in any column
 * the user had not selected. Sending `null` leaves it intact.
 *
 * Two writers changing the SAME column still resolve last-writer-wins.
 * Graph exposes no conditional token for this endpoint, so that case is not
 * detectable; step 3 of the guided configuration says so plainly rather
 * than implying protection that does not exist.
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
 * `address` always covers `A{row}:{lastHeaderCol}{row}`. The ADDRESS still
 * spans the whole row — the payload is what is sparse. Addressing the full
 * span keeps the array indices aligned with the header indices, which is
 * what lets non-contiguous columns be written in one request.
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

  // ── The write payload (EXCEL-UPDATE-ROW-CONCURRENCY-4) ─────────────────
  // Every position starts as `null`, which Microsoft documents as an
  // instruction to SKIP that cell — "No update takes place to the intended
  // target (cell) when null input is sent". Only the columns the user chose
  // are then filled in. See the block comment above for why this replaces
  // the read-back-and-rewrite merge.
  const cells: unknown[] = new Array<unknown>(columnCount).fill(null);
  for (const [columnName, value] of Object.entries(config.values)) {
    const idx = headerIndex.get(columnName);
    if (idx === undefined) continue; // already caught above; defensive.
    // Written verbatim: `""` clears the cell, a value writes it, and a
    // legacy `null` authored before S4 lands back on `null`, which is a
    // skip — the same thing it has always actually done at the provider.
    cells[idx] = value;
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
        values: [cells],
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
