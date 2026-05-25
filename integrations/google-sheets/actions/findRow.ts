import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { valuesGet } from "../api/valuesGet";
import { NotFoundError } from "../api/errors";
import {
  FindRowConfigSchema,
  type FindRowConfig,
} from "./findRow.schema";

/**
 * Google Sheets find_row action handler (Sheets 2.1 Commit 2).
 *
 * Reads the entire sheet via `values.get` and scans for rows whose
 * `column` cell equals `value`. Row 0 is treated as headers; data rows
 * begin at row 2 in 1-indexed Sheets terms. Wraps the principal API
 * call in `refreshAndRetry` (Q3); read-only so no idempotency concern.
 *
 * Output is uniform across `returnAll` true/false: callers always get
 * `matches: Array<{rowNumber, rowData}>`, plus convenience scalars
 * (`found`, `firstMatch`, `count`) so the common single-match case is a
 * one-token reference (`{{node.firstMatch.rowData.Email}}`).
 *
 * Empty cells in the search column are skipped (don't match against
 * non-empty values). Mirrors V1 behavior — searching for an empty
 * value is out of scope for Batch 1.
 */
export const findRow: ActionHandler = async (input) => {
  const config: FindRowConfig = FindRowConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-sheets"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-sheets",
    accountId,
    apiCall: (accessToken) =>
      valuesGet({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        range: config.sheetName,
      }),
  });

  const allRows = result.values ?? [];
  const headers = (allRows[0] ?? []).map((h) => String(h ?? ""));
  const dataRows = allRows.slice(1);

  // No rows at all — return empty match set (NOT a failure).
  if (allRows.length === 0 || dataRows.length === 0) {
    return {
      output: {
        spreadsheetId: config.spreadsheetId,
        sheetName: config.sheetName,
        column: config.column,
        found: false,
        firstMatch: null,
        matches: [],
        count: 0,
      },
    };
  }

  const columnIndex = headers.indexOf(config.column);
  if (columnIndex === -1) {
    throw new NotFoundError(
      `column '${config.column}' in sheet '${config.sheetName}'`,
      `headers: ${headers.join(", ")}`,
    );
  }

  // Equality comparison is value-shape-aware: numeric / boolean / string
  // fields all coerce to string for the cell-value comparison so that
  // "100" stored as a number matches "100" passed as a string. This
  // matches Sheets' UI-level "show me row where Status = active"
  // intuition.
  const needle = String(config.value);

  const matches: Array<{ rowNumber: number; rowData: Record<string, unknown> }> = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row) continue;
    const cell = row[columnIndex];
    if (cell === undefined || cell === null || cell === "") continue;
    if (String(cell) !== needle) continue;

    const rowData: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      if (header) rowData[header] = row[idx] ?? null;
    });

    matches.push({
      rowNumber: i + 2, // 1-indexed including header row
      rowData,
    });

    if (!config.returnAll) break;
  }

  return {
    output: {
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName,
      column: config.column,
      found: matches.length > 0,
      firstMatch: matches[0] ?? null,
      matches,
      count: matches.length,
    },
  };
};
