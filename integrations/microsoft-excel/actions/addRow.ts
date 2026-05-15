import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { worksheetUsedRange } from "../api/worksheetUsedRange";
import { worksheetRangePatch } from "../api/worksheetRangePatch";
import { AddRowConfigSchema, type AddRowConfig } from "./addRow.schema";
import type { ExcelRange } from "../api/types";

/**
 * Excel `add_row` action handler.
 *
 * Microsoft Excel parity Commit 3 — two modes:
 *
 *   SINGLE-ROW (slice-15 default — backwards-compatible):
 *     `config.values: unknown[]` → append one row at the tail of the
 *     used range. Pads / truncates to the existing column count.
 *
 *   BATCH (new):
 *     `config.rows: Array<Record<columnHeader, cellValue>>` →
 *     header-validated append of 1..1000 rows in a single Graph
 *     range PATCH. No silent chunking, no silent partial success
 *     (parity audit acceptance).
 *
 * Both modes share the leading `usedRange` GET. The batch path
 * additionally builds a header→columnIndex map from row 1, validates
 * every column key in every row, and fails loudly listing all
 * unknown column names (with row index) if any are missing.
 *
 * Empty-sheet semantics:
 *   - Single-row mode: appends at A1 with the supplied values
 *     spanning their own length (existing behavior).
 *   - Batch mode: rejects — header-based batch requires headers to
 *     validate against. Workflow authors who want to seed an empty
 *     sheet with headers + rows compose `add_row(values: [...])` to
 *     write the header row first, then `add_row(rows: [...])` for
 *     data.
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

  if (config.rows !== undefined) {
    return executeBatch({
      input,
      config,
      used,
      accountId,
      rows: config.rows,
    });
  }

  // values is guaranteed defined by the schema's XOR refine.
  return executeSingle({
    input,
    config,
    used,
    accountId,
    values: config.values!,
  });
};

interface ExecuteContext {
  input: Parameters<ActionHandler>[0];
  config: AddRowConfig;
  used: ExcelRange;
  accountId: string | null;
}

async function executeSingle(
  ctx: ExecuteContext & { values: readonly unknown[] },
): Promise<ReturnType<ActionHandler>> {
  const { input, config, used, accountId, values } = ctx;

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
    columnCount = values.length;
  } else {
    targetRow = (used.rowCount ?? used.values.length) + 1;
    columnCount = used.columnCount ?? (used.values[0]?.length ?? values.length);
  }

  // Pad / truncate the supplied values to the target column span.
  const aligned: unknown[] = [];
  for (let i = 0; i < columnCount; i++) {
    aligned.push(i < values.length ? (values[i] ?? null) : null);
  }

  const address = `A${targetRow}:${columnLetter(columnCount)}${targetRow}`;

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
      workbookId: config.workbookId,
      worksheetName: config.worksheetName,
      address,
      rowIndex: targetRow,
      columnCount,
      valuesWritten: aligned,
    },
  };
}

async function executeBatch(
  ctx: ExecuteContext & { rows: ReadonlyArray<Record<string, unknown>> },
): Promise<ReturnType<ActionHandler>> {
  const { input, config, used, accountId, rows } = ctx;

  const sheetRows = used.values ?? [];
  if (sheetRows.length === 0) {
    throw new Error(
      `add_row: batch mode requires worksheet headers; worksheet '${config.worksheetName}' has no usedRange.`,
    );
  }

  const headerRow = sheetRows[0] ?? [];
  const headerIndex = new Map<string, number>();
  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i];
    if (typeof h === "string" && h.length > 0) {
      headerIndex.set(h, i);
    }
  }

  if (headerIndex.size === 0) {
    throw new Error(
      `add_row: batch mode requires non-empty headers in row 1 of worksheet '${config.worksheetName}'.`,
    );
  }

  // Collect ALL unknown columns across ALL rows before throwing, so
  // workflow authors see every offender in one error rather than
  // fixing one and discovering the next on the retry.
  const unknownReports: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const unknown = Object.keys(row).filter((k) => !headerIndex.has(k));
    if (unknown.length > 0) {
      unknownReports.push(
        `row ${r + 1}: ${unknown.map((c) => `'${c}'`).join(", ")}`,
      );
    }
  }
  if (unknownReports.length > 0) {
    const headers = headerRow
      .filter((h): h is string => typeof h === "string")
      .map((h) => `'${h}'`)
      .join(", ");
    throw new Error(
      `add_row: column(s) not found in worksheet headers — ${unknownReports.join("; ")}. Available columns: ${headers || "(none)"}.`,
    );
  }

  const columnCount = headerRow.length;
  // Used-range tail row (1-based). For a worksheet with only the
  // header row, `rowCount === 1` and the first batch row lands at
  // row 2 (mirrors single-row append semantics).
  const tail = used.rowCount ?? sheetRows.length;
  const firstRowNumber = tail + 1;
  const lastRowNumber = firstRowNumber + rows.length - 1;

  // Build the 2D aligned values array — outer = rows, inner = columns.
  // Missing columns in a row stay null; existing-cell preservation
  // doesn't apply here because we're appending past the used range.
  const aligned: unknown[][] = rows.map((row) => {
    const arr: unknown[] = new Array(columnCount).fill(null);
    for (const [columnName, value] of Object.entries(row)) {
      const idx = headerIndex.get(columnName);
      if (idx === undefined) continue; // already caught above.
      arr[idx] = value;
    }
    return arr;
  });

  const endCol = columnLetter(columnCount);
  const address = `A${firstRowNumber}:${endCol}${lastRowNumber}`;

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
        values: aligned,
      }),
  });

  return {
    output: {
      workbookId: config.workbookId,
      worksheetName: config.worksheetName,
      address,
      rowCount: rows.length,
      rowsAdded: rows.length,
      firstRowNumber,
      lastRowNumber,
      columnCount,
    },
  };
}

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
