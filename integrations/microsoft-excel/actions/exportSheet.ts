import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { worksheetUsedRange } from "../api/worksheetUsedRange";
import { ExportSheetConfigSchema } from "./exportSheet.schema";

/**
 * Excel `export_sheet` (Get Rows) action handler.
 *
 * Read-only — returns the parsed cell matrix of a worksheet's used
 * range. When `hasHeaders` is true (default), the first row becomes
 * the column-name set and each subsequent row is materialized as an
 * object keyed by header name; otherwise rows are returned as positional
 * arrays.
 *
 * Output shape (downstream variable refs):
 *   - `headers`: string[] | null  (null when hasHeaders=false)
 *   - `rows`: Array<Record<string, unknown>> | Array<unknown[]>
 *   - `rowCount`: number  (data rows, not counting the header row)
 *   - `columnCount`: number
 *   - `address`: string  (Graph's sheet-qualified used-range address)
 */
export const exportSheet: ActionHandler = async (input) => {
  const config = ExportSheetConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.accountId
      : null;

  const range = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-excel",
    accountId,
    apiCall: (accessToken) =>
      worksheetUsedRange({
        accessToken,
        workbookId: config.workbookId,
        worksheetName: config.worksheetName,
        valuesOnly: true,
      }),
  });

  const allValues = range.values ?? [];

  if (config.hasHeaders) {
    if (allValues.length === 0) {
      return {
        output: {
          headers: [],
          rows: [],
          rowCount: 0,
          columnCount: range.columnCount ?? 0,
          address: range.address ?? "",
        },
      };
    }
    const headerRow = allValues[0] ?? [];
    const headers = headerRow.map((cell) =>
      cell === null || cell === undefined ? "" : String(cell),
    );
    let dataRows = allValues.slice(1);
    if (config.limit !== undefined) {
      dataRows = dataRows.slice(0, config.limit);
    }
    const rows = dataRows.map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (h !== "") obj[h] = row[i] ?? null;
      });
      return obj;
    });
    return {
      output: {
        headers,
        rows,
        rowCount: rows.length,
        columnCount: range.columnCount ?? headers.length,
        address: range.address ?? "",
      },
    };
  }

  // hasHeaders = false → return positional rows verbatim.
  let dataRows = allValues.slice();
  if (config.limit !== undefined) {
    dataRows = dataRows.slice(0, config.limit);
  }
  return {
    output: {
      headers: null,
      rows: dataRows,
      rowCount: dataRows.length,
      columnCount: range.columnCount ?? 0,
      address: range.address ?? "",
    },
  };
};
