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
 * "No silent no-op if target is missing": the handler throws if the
 * supplied row is beyond the worksheet's used range AND the user is
 * updating a header-named column (we have no headers to resolve
 * against). If the row IS in range but the column key doesn't match
 * any header, we throw — no silent skip.
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
  // Read the existing row (1-based row number → 0-based index).
  // When the target row is beyond the used range, treat it as a row
  // of nulls — we'll write the supplied updates at their column
  // positions and pad the rest with null (which preserves Excel's
  // empty-cell semantics).
  const existingRow =
    config.rowNumber - 1 < rows.length
      ? (rows[config.rowNumber - 1] ?? [])
      : [];

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
