import { createHash } from "node:crypto";

/**
 * Shared bounded-snapshot helpers for Google Sheets triggers
 * (Sheets 2.3 Commit 2).
 *
 * Used by `row_changed` (when `changeKinds` includes "updated" or
 * "removed") and any future Sheets trigger that needs per-row diff
 * detection. The shape mirrors Microsoft Excel's
 * `_shared/snapshot.ts` — same `rowHashes` + `rowCount` + stable
 * SHA-256 hash function — but adds:
 *
 *   - **Bounded window:** snapshot covers at most `snapshotRowLimit`
 *     data rows (last N rows of the sheet). Older rows are not
 *     diff-tracked. Storage cost is `O(N × workflows)` regardless of
 *     sheet size. Replaces V1's unbounded
 *     `googleSheetsRowSnapshot.rowHashes` that scaled as
 *     `O(rows × workflows)` (audit R-3).
 *
 *   - **Key mode:** `positional` (1-based sheet row index, header
 *     offset honored) OR `keyColumn` (value of a named header column,
 *     coerced to string). Positional default matches V1 + Excel
 *     `updated_row` accepted-shift limitation; `keyColumn` opt-in
 *     gives stable identity across mid-sheet inserts/deletes
 *     (mirrors Excel `updated_table_row`).
 *
 *   - **Window metadata** (`windowStart` / `windowEnd`): 1-indexed
 *     SHEET row positions (header-inclusive) that the snapshot
 *     represents. Required so the downstream diff (Commit 3) can
 *     distinguish a window slide (row left the snapshot because it
 *     fell off the bound) from a genuine removal (row deleted from
 *     within the window's overlapping range). See D-RemovedWindowSlide
 *     in `docs/slices/google-sheets-2-3-triggers-plan.md` §9.
 *
 * No diff helpers in this module yet — `findAdded` / `findUpdated` /
 * `findRemoved` ship alongside the firing logic in Commit 3
 * (`integrations/google-sheets/triggers/rowChanged/pull.ts`).
 */

/** Sentinel returned by `buildBoundedSnapshot` when the sheet
 * exceeds `snapshotRowLimit × 2` at build time — activate.ts
 * converts this into a thrown error that aborts the workflow's
 * activate transition. Matches D-OverflowAtActivate. */
export class SnapshotOverflowError extends Error {
  readonly totalRows: number;
  readonly snapshotRowLimit: number;
  constructor(totalRows: number, snapshotRowLimit: number) {
    super(
      `Sheet has ${totalRows} data rows; snapshotRowLimit=${snapshotRowLimit} (max acceptable: ${snapshotRowLimit * 2}). Raise snapshotRowLimit explicitly to opt into tracking sheets this large.`,
    );
    this.name = "SnapshotOverflowError";
    this.totalRows = totalRows;
    this.snapshotRowLimit = snapshotRowLimit;
  }
}

/** Thrown by `buildBoundedSnapshot` when `keyColumn` doesn't appear
 * in the header row. Activate surfaces this as a config error so the
 * workflow author can fix the header reference. */
export class KeyColumnNotFoundError extends Error {
  readonly keyColumn: string;
  constructor(keyColumn: string) {
    super(`keyColumn '${keyColumn}' not found in header row.`);
    this.name = "KeyColumnNotFoundError";
    this.keyColumn = keyColumn;
  }
}

/** Thrown by `buildBoundedSnapshot` when `keyColumn` is set but the
 * sheet has no header row (or the header row is empty). The schema's
 * `.refine` prevents this at parse time, but the helper guards
 * defensively in case the snapshot is built from a sheet that lost
 * its header between activation and re-poll. */
export class KeyColumnRequiresHeaderError extends Error {
  constructor() {
    super("keyColumn snapshot requires a non-empty header row.");
    this.name = "KeyColumnRequiresHeaderError";
  }
}

export type SnapshotKeyMode = "positional" | "keyColumn";

export interface BoundedSnapshot {
  /** Map of key → sha256 hex hash of the row's values. Keys are
   * 1-indexed sheet row numbers (positional mode) or string-coerced
   * key-column values (keyColumn mode). */
  rowHashes: Record<string, string>;
  /** Total number of DATA rows in the sheet (excludes header row
   * when `headerRow=true`). Distinct from the snapshot's window size
   * — this is the full count, the snapshot may cover only the last
   * N data rows. */
  rowCount: number;
  /** 1-indexed sheet row number of the first row in the window
   * (header-inclusive numbering — sheet row 1 is row 1 regardless of
   * `headerRow`). Equal to `windowEnd + 1` when the sheet has no
   * data rows. */
  windowStart: number;
  /** 1-indexed sheet row number of the last row in the window. Zero
   * when the sheet has no data rows. */
  windowEnd: number;
  /** How keys are computed: positional (1-based sheet row index) or
   * keyColumn (value of the configured header column). */
  keyMode: SnapshotKeyMode;
  /** Echo of the input `keyColumn` config — null in positional mode. */
  keyColumn: string | null;
  /** ISO 8601 timestamp when this snapshot was built. */
  updatedAt: string;
}

export interface BuildBoundedSnapshotInput {
  /** Full sheet values from `values.get` (header row included when
   * the sheet has one). The helper does NOT call the API itself —
   * the caller (activate / pull) is responsible for the network
   * fetch. */
  rows: ReadonlyArray<ReadonlyArray<unknown>>;
  /** Whether row 0 of `rows` is a header row that should be excluded
   * from the data set. */
  headerRow: boolean;
  /** Maximum number of data rows to track. The snapshot's window
   * covers the LAST `snapshotRowLimit` data rows. */
  snapshotRowLimit: number;
  /** When set, build a keyColumn snapshot instead of positional.
   * Requires `headerRow=true` and a header row containing this
   * column name. */
  keyColumn: string | null;
  /** Optional now() override for deterministic tests. Default:
   * Date.now(). */
  now?: () => Date;
}

export interface BuildBoundedSnapshotResult {
  snapshot: BoundedSnapshot;
  /** Number of rows whose keyColumn value collided with an earlier
   * row in the same snapshot. Zero in positional mode. The caller
   * decides how to surface this (activate throws, pull logs a
   * structured warning). */
  duplicateKeyCount: number;
  /** Number of rows whose keyColumn value was empty/null/undefined.
   * Zero in positional mode. Empty-key rows are excluded from the
   * snapshot entirely. */
  emptyKeyCount: number;
}

/**
 * Build a bounded snapshot from sheet values.
 *
 * @throws SnapshotOverflowError when `dataRows.length > snapshotRowLimit * 2`
 * @throws KeyColumnRequiresHeaderError when `keyColumn` is set but the
 *   sheet has no header row.
 * @throws KeyColumnNotFoundError when `keyColumn` does not appear in
 *   the header row.
 */
export function buildBoundedSnapshot(
  input: BuildBoundedSnapshotInput,
): BuildBoundedSnapshotResult {
  const { rows, headerRow, snapshotRowLimit, keyColumn } = input;
  const now = input.now ?? (() => new Date());

  const headerValues = headerRow && rows.length > 0 ? rows[0]! : null;
  const dataRows = headerRow ? rows.slice(1) : rows;
  const totalDataRows = dataRows.length;

  // Hard-overflow guard. Mirrors the audit R-3 mitigation + the
  // accepted D-OverflowAtActivate strict-reject decision.
  if (totalDataRows > snapshotRowLimit * 2) {
    throw new SnapshotOverflowError(totalDataRows, snapshotRowLimit);
  }

  // Compute the window. Empty sheet → empty snapshot, windowEnd=0.
  // Non-empty + within cap → window covers the last min(total,
  // snapshotRowLimit) data rows. We track sheet row numbers
  // (header-inclusive) so downstream diff can reason about positional
  // shifts directly.
  const headerOffset = headerRow ? 1 : 0;
  const windowDataRows = Math.min(totalDataRows, snapshotRowLimit);
  let windowStart: number;
  let windowEnd: number;
  if (totalDataRows === 0) {
    windowStart = headerOffset + 1; // first data-row position even when empty
    windowEnd = 0;
  } else {
    windowEnd = totalDataRows + headerOffset;
    windowStart = windowEnd - windowDataRows + 1;
  }
  const windowDataStart = totalDataRows - windowDataRows; // 0-indexed slice start in dataRows
  const windowRows = dataRows.slice(windowDataStart, totalDataRows);

  let rowHashes: Record<string, string>;
  let duplicateKeyCount = 0;
  let emptyKeyCount = 0;
  const keyMode: SnapshotKeyMode = keyColumn === null ? "positional" : "keyColumn";

  if (keyColumn === null) {
    // Positional mode — key is the 1-based SHEET row index
    // (header-inclusive numbering).
    rowHashes = {};
    windowRows.forEach((row, i) => {
      const sheetRowIndex = windowStart + i;
      rowHashes[String(sheetRowIndex)] = hashRow(row);
    });
  } else {
    // keyColumn mode — require non-empty header row + column present.
    if (headerValues === null) {
      throw new KeyColumnRequiresHeaderError();
    }
    const columnIndex = findColumnIndex(headerValues, keyColumn);
    if (columnIndex === -1) {
      throw new KeyColumnNotFoundError(keyColumn);
    }
    rowHashes = {};
    for (const row of windowRows) {
      const cellValue = row[columnIndex];
      if (isEmptyKey(cellValue)) {
        emptyKeyCount += 1;
        continue;
      }
      const key = String(cellValue);
      if (rowHashes[key] !== undefined) {
        duplicateKeyCount += 1;
      }
      // Last-write-wins on duplicates. Pull-side logs a structured
      // warning when duplicateKeyCount > 0.
      rowHashes[key] = hashRow(row);
    }
  }

  return {
    snapshot: {
      rowHashes,
      rowCount: totalDataRows,
      windowStart,
      windowEnd,
      keyMode,
      keyColumn,
      updatedAt: now().toISOString(),
    },
    duplicateKeyCount,
    emptyKeyCount,
  };
}

/** Stable SHA-256 hex hash of the row's values. Uses canonical
 * `JSON.stringify` — array order preserved, scalars
 * (`string|number|boolean|null`) inside. Matches the eventId hash
 * algorithm in `rowChanged/normalize.ts:rowValuesHash` so dedup
 * keys stay aligned. */
export function hashRow(values: ReadonlyArray<unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex");
}

function findColumnIndex(
  headerValues: ReadonlyArray<unknown>,
  columnName: string,
): number {
  // Strict equality first; fall back to string-coerced match so a
  // header that arrived as a number (rare) still resolves.
  const direct = headerValues.findIndex((h) => h === columnName);
  if (direct !== -1) return direct;
  return headerValues.findIndex((h) => String(h) === columnName);
}

function isEmptyKey(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}
