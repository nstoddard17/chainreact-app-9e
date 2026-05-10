import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { worksheetUsedRange } from "../api/worksheetUsedRange";
import { worksheetRangePatch } from "../api/worksheetRangePatch";
import { AddRowConfigSchema } from "./addRow.schema";

/**
 * Excel `add_row` action handler.
 *
 * Append-tail mode (Slice 15 only — V1's prepend / specific-row options
 * deferred). Algorithm:
 *   1. GET worksheet usedRange to find current row count + column count.
 *   2. Compute target A1 address for the next row, spanning the existing
 *      column count (or the supplied values' column count if the sheet
 *      is empty).
 *   3. Pad / truncate the values array to match the target column span.
 *   4. PATCH the values to that range.
 *
 * Output shape (downstream variable refs):
 *   { address, rowIndex, columnCount, valuesWritten }
 */
export const addRow: ActionHandler = async (input) => {
  const config = AddRowConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.accountId
      : null;

  const used = await refreshAndRetry({
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

  // Graph's usedRange against an empty worksheet returns rowCount/
  // columnCount both 1 with a single null cell. Detect that to avoid
  // mistakenly "appending" at row 2.
  const isEmpty =
    (used.values?.length ?? 0) === 0 ||
    (used.values.length === 1 &&
      (used.values[0]?.length ?? 0) === 1 &&
      (used.values[0]![0] === null || used.values[0]![0] === undefined));

  let targetRow: number;
  let columnCount: number;

  if (isEmpty) {
    targetRow = 1;
    columnCount = config.values.length;
  } else {
    targetRow = (used.rowCount ?? used.values.length) + 1;
    columnCount = used.columnCount ?? (used.values[0]?.length ?? config.values.length);
  }

  // Pad / truncate the supplied values to the target column span.
  const aligned: unknown[] = [];
  for (let i = 0; i < columnCount; i++) {
    aligned.push(i < config.values.length ? (config.values[i] ?? null) : null);
  }

  const startCol = "A";
  const endCol = columnLetter(columnCount);
  const address = `${startCol}${targetRow}:${endCol}${targetRow}`;

  await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-excel",
    accountId,
    apiCall: (accessToken) =>
      worksheetRangePatch({
        accessToken,
        workbookId: config.workbookId,
        worksheetName: config.worksheetName,
        address,
        values: [aligned],
      }),
  });

  return {
    output: {
      address,
      rowIndex: targetRow,
      columnCount,
      valuesWritten: aligned,
    },
  };
};

/**
 * Converts a 1-based column number to its A1 letter (1 → A, 26 → Z,
 * 27 → AA, …). Supports the full A1 grid Excel allows
 * (max 16,384 columns = `XFD`).
 */
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
