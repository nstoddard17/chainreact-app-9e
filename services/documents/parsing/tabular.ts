/**
 * Shared tabular serialization for CSV/XLSX parsers.
 *
 * Row scan caps bound memory BEFORE the char budget applies
 * (AI-PROVIDER-PLAN-1 §4.6). Hitting a cap is always surfaced via
 * `truncated` + a warning — never silent.
 */

export const MAX_SCAN_ROWS = 5000;
export const MAX_SCAN_COLUMNS = 256;

export const ROW_CAP_WARNING = "row_scan_cap_reached";
export const COLUMN_CAP_WARNING = "column_scan_cap_reached";

/**
 * Pipe-delimited row rendering ("a | b | c"). Pipes inside cells are
 * escaped so column boundaries stay unambiguous; newlines collapse to
 * spaces so one row is always one line.
 */
export function serializeRow(cells: readonly string[]): string {
  return cells
    .map((cell) => cell.replace(/\|/g, "\\|").replace(/\r?\n/g, " "))
    .join(" | ");
}
