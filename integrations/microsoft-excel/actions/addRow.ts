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

  if (config.rows !== undefined) {
    return executeBatch({
      input,
      config,
      used,
      providerAccountId,
      rows: config.rows,
    });
  }

  // values is guaranteed defined by the schema's XOR refine.
  return executeSingle({
    input,
    config,
    used,
    providerAccountId,
    values: config.values!,
  });
};

interface ExecuteContext {
  input: Parameters<ActionHandler>[0];
  config: AddRowConfig;
  used: ExcelRange;
  providerAccountId: string | null;
}

async function executeSingle(
  ctx: ExecuteContext & { values: readonly unknown[] },
): Promise<ReturnType<ActionHandler>> {
  const { input, config, used, providerAccountId, values } = ctx;

  // Anchor the append. An empty worksheet starts at A1; a non-empty one appends
  // just past its ABSOLUTE last used row. Two bugs are fixed here:
  //   1. Empty detection: Graph's usedRange against a genuinely empty worksheet
  //      returns its lone cell as the empty STRING "" (not null), so the old
  //      null-only guard saw it as non-empty and wrongly appended at row 2.
  //   2. Anchoring: the old code used `rowCount` (the COUNT of rows in the used
  //      range) as if it were the absolute last row. Those diverge whenever the
  //      used range doesn't start at row 1 (e.g. content only at A2), so
  //      repeated appends recomputed the same target and overwrote each other.
  //      `lastUsedRow` parses the absolute last row from the range address.
  const isEmpty = isUsedRangeEmpty(used);

  let targetRow: number;
  let columnCount: number;

  if (isEmpty) {
    targetRow = 1;
    columnCount = values.length;
  } else {
    targetRow = lastUsedRow(used) + 1;
    columnCount = used.columnCount ?? (used.values[0]?.length ?? values.length);
  }

  // Pad / truncate the supplied values to the target column span.
  const aligned: unknown[] = [];
  for (let i = 0; i < columnCount; i++) {
    aligned.push(i < values.length ? (values[i] ?? null) : null);
  }

  const address = `A${targetRow}:${columnLetter(columnCount)}${targetRow}`;

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
  const { input, config, used, providerAccountId, rows } = ctx;

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
  // Absolute last used row (parsed from the address), NOT rowCount — see
  // lastUsedRow. Batch mode requires headers in row 1, so in the normal case
  // this equals rowCount (header-only sheet → 1 → first batch row at 2);
  // parsing the address keeps the anchor correct if the range starts below
  // row 1, mirroring the single-row append fix.
  const tail = lastUsedRow(used);
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
    accountId: input.accountId,
    provider: "microsoft-excel",
    providerAccountId,
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
 * A cell is "blank" for append purposes when it carries no author-meaningful
 * content: `null`, `undefined`, or the empty string `""`. Graph's usedRange
 * against a genuinely empty worksheet returns its lone cell as `""` (NOT null,
 * despite the Range type's general claim), so empty-string MUST count as blank
 * or the first append wrongly lands at row 2. `0` and `false` are real values
 * a workflow may legitimately write and are deliberately NOT blank; a
 * whitespace or any non-empty string is content too.
 */
function isBlankCell(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/**
 * True when the used range has no real content yet — no cells, or every cell is
 * blank (`isBlankCell`). Such a worksheet's first append starts at A1.
 */
function isUsedRangeEmpty(used: ExcelRange): boolean {
  const rows = used.values ?? [];
  for (const row of rows) {
    for (const cell of row) {
      if (!isBlankCell(cell)) return false;
    }
  }
  return true;
}

/**
 * Absolute last (1-based) sheet row of a used range, parsed from its A1
 * address — e.g. `"Sheet1!A2:C5"` → 5, `"Sheet1!A2"` → 2. This is the absolute
 * row, unlike `rowCount`, which is only the COUNT of rows inside the range;
 * the two diverge whenever the used range does not start at row 1 (content only
 * at A2 → address `"Sheet1!A2"`, rowCount 1). Anchoring an append on rowCount
 * therefore collides repeated appends at the same row. Falls back to `rowCount`
 * (assuming the range starts at row 1) only if the address is unparseable.
 */
function lastUsedRow(used: ExcelRange): number {
  const addr = used.address ?? "";
  const local = addr.includes("!") ? addr.slice(addr.lastIndexOf("!") + 1) : addr;
  const end = local.includes(":") ? local.slice(local.indexOf(":") + 1) : local;
  const match = end.match(/(\d+)\s*$/);
  if (match) return parseInt(match[1]!, 10);
  return used.rowCount ?? used.values.length;
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
