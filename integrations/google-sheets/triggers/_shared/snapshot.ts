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
  /** Windowed row entries paired with their snapshot key. Pull-side
   * diff helpers iterate this to resolve current row values when
   * emitting added/updated payloads. Empty for rows that didn't make
   * it into the snapshot (empty-key rows in keyColumn mode). */
  entries: RowKeyed[];
}

/** Sheet row paired with its snapshot key. Used by the pull-side
 * diff helpers below — the snapshot itself stores hashes only, so
 * the diff needs the live row values from the same pull cycle to
 * build added/updated event payloads. */
export interface RowKeyed {
  /** Snapshot key — 1-indexed sheet row number as a string in
   * positional mode, keyColumn cell value coerced to string in
   * keyColumn mode. */
  key: string;
  /** 1-indexed sheet row number (header-inclusive). Always
   * populated for rows that came from a live `values.get`. */
  rowIndex: number;
  /** Row values from the live sheet. */
  rowValues: ReadonlyArray<unknown>;
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
  const entries: RowKeyed[] = [];

  if (keyColumn === null) {
    // Positional mode — key is the 1-based SHEET row index
    // (header-inclusive numbering).
    rowHashes = {};
    windowRows.forEach((row, i) => {
      const sheetRowIndex = windowStart + i;
      const key = String(sheetRowIndex);
      rowHashes[key] = hashRow(row);
      entries.push({ key, rowIndex: sheetRowIndex, rowValues: row });
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
    // Track entries per key; last-write-wins so a later collision
    // overwrites the entry, matching the rowHashes behavior.
    const entriesByKey = new Map<string, RowKeyed>();
    windowRows.forEach((row, i) => {
      const sheetRowIndex = windowStart + i;
      const cellValue = row[columnIndex];
      if (isEmptyKey(cellValue)) {
        emptyKeyCount += 1;
        return;
      }
      const key = String(cellValue);
      if (rowHashes[key] !== undefined) {
        duplicateKeyCount += 1;
      }
      // Last-write-wins on duplicates. Pull-side logs a structured
      // warning when duplicateKeyCount > 0.
      rowHashes[key] = hashRow(row);
      entriesByKey.set(key, { key, rowIndex: sheetRowIndex, rowValues: row });
    });
    for (const entry of entriesByKey.values()) {
      entries.push(entry);
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
    entries,
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

// ──────────────────────────────────────────────────────────────────
// Sheets 2.3 Commit 3 — bounded-snapshot diff helpers.
// ──────────────────────────────────────────────────────────────────
//
// Three diff entry types. Used by `rowChanged/pull.ts` to emit
// added/updated/removed events. The helpers are pure — they
// consume snapshots + the current pull cycle's windowed entries
// and return event-ready diff records.
//
// Window-slide distinction (D-RemovedWindowSlide accepted):
//   - In POSITIONAL mode, a previous key absent from the current
//     snapshot may be EITHER (a) genuinely deleted from the sheet
//     (`previous key > current.windowEnd` → the row no longer
//     exists past the new sheet's end), or (b) slid out of the
//     bounded window (sheet grew past the cap; the row still exists
//     in the sheet but isn't tracked anymore). Only (a) fires
//     `removed` events; (b) is silently un-tracked.
//   - In KEYCOLUMN mode, there's no window concept — keys are by
//     value, not position. Any previous key absent from current is
//     a genuine removal (the row was deleted OR the keyColumn cell
//     value changed; both effectively destroy the identity).

export interface DiffEntry {
  /** Snapshot key (positional row number or keyColumn value). */
  key: string;
  /** 1-indexed sheet row number where the row currently lives. Null
   * for `removed` events because the row no longer exists. */
  rowIndex: number | null;
  /** Current row values from this pull cycle. Null for `removed`
   * events. */
  rowValues: ReadonlyArray<unknown> | null;
  /** sha256 hex of the current row values for added/updated, OR the
   * pre-removal hash for removed. Used by `normalize.ts` to build the
   * eventId. */
  hash: string;
}

/** Keys in `current.rowHashes` that are NOT in `previous.rowHashes`.
 * Resolves each to its source RowKeyed entry for payload values. */
export function findAdded(
  previous: BoundedSnapshot,
  current: BoundedSnapshot,
  currentEntries: ReadonlyArray<RowKeyed>,
): DiffEntry[] {
  const entriesByKey = indexByKey(currentEntries);
  const added: DiffEntry[] = [];
  for (const [key, hash] of Object.entries(current.rowHashes)) {
    if (Object.prototype.hasOwnProperty.call(previous.rowHashes, key)) {
      continue;
    }
    const entry = entriesByKey.get(key);
    if (!entry) continue; // Defensive: snapshot has the key, entries don't — skip.
    added.push({
      key,
      rowIndex: entry.rowIndex,
      rowValues: entry.rowValues,
      hash,
    });
  }
  return added;
}

/** Keys present in BOTH snapshots whose hashes differ. */
export function findUpdated(
  previous: BoundedSnapshot,
  current: BoundedSnapshot,
  currentEntries: ReadonlyArray<RowKeyed>,
): DiffEntry[] {
  const entriesByKey = indexByKey(currentEntries);
  const updated: DiffEntry[] = [];
  for (const [key, currHash] of Object.entries(current.rowHashes)) {
    const prevHash = previous.rowHashes[key];
    if (prevHash === undefined) continue;
    if (prevHash === currHash) continue;
    const entry = entriesByKey.get(key);
    if (!entry) continue;
    updated.push({
      key,
      rowIndex: entry.rowIndex,
      rowValues: entry.rowValues,
      hash: currHash,
    });
  }
  return updated;
}

/** Keys present in `previous.rowHashes` but absent from
 * `current.rowHashes`, filtered to exclude window-slide artifacts
 * (positional mode only — see module-level comment).
 *
 * Returns the pre-removal hash so `normalize.ts` can build a stable
 * removed-event eventId that dedups naturally if Sheets fires the
 * same removal twice. */
export function findRemoved(
  previous: BoundedSnapshot,
  current: BoundedSnapshot,
): DiffEntry[] {
  const removed: DiffEntry[] = [];
  for (const [key, prevHash] of Object.entries(previous.rowHashes)) {
    if (Object.prototype.hasOwnProperty.call(current.rowHashes, key)) {
      continue;
    }
    if (isWindowSlideArtifact(key, previous, current)) {
      continue;
    }
    removed.push({
      key,
      rowIndex: null,
      rowValues: null,
      hash: prevHash,
    });
  }
  return removed;
}

function indexByKey(
  entries: ReadonlyArray<RowKeyed>,
): Map<string, RowKeyed> {
  const m = new Map<string, RowKeyed>();
  for (const entry of entries) {
    m.set(entry.key, entry);
  }
  return m;
}

/**
 * Returns true when the previous key was inside the bounded window
 * but the new snapshot's window no longer covers it BECAUSE the
 * sheet grew past the cap — NOT because the row was deleted.
 *
 * Positional mode rule:
 *   - Numeric key K (sheet row number, header-inclusive).
 *   - If K > current.windowEnd: the sheet doesn't have row K anymore.
 *     Genuine removal — caller fires the event.
 *   - If K ≤ current.windowEnd AND K < current.windowStart: row K
 *     still exists in the sheet but slid out of the front of the
 *     window. Slide artifact — caller suppresses.
 *
 * KeyColumn mode: no window concept; always returns false (every
 * previous key absent from current is a genuine removal).
 */
// ──────────────────────────────────────────────────────────────────
// Worksheet-list snapshot (Sheets 2.3 Commit 4 — new_worksheet trigger).
// ──────────────────────────────────────────────────────────────────
//
// Distinct from `BoundedSnapshot`. The new_worksheet trigger doesn't
// need hash-per-row tracking — it just diffs the spreadsheet's
// worksheet-name list across pull cycles. Renames look like
// `{ remove old name, add new name }` from `spreadsheets.get`'s
// perspective and fire one event for the new name (matches V1 +
// Microsoft Excel `new_worksheet` documented behavior).
//
// Shape mirrors Microsoft Excel's `ExcelWorksheetListSnapshot` so
// future cross-provider helpers stay aligned, but lives in this
// provider-local module per the V2 cross-provider import policy.

export interface WorksheetListSnapshot {
  /** Worksheet titles in workbook order (preserved as Sheets returns
   * them). Diff is set-difference, so re-ordering does NOT fire the
   * trigger. */
  names: string[];
  /** ISO 8601 timestamp when this snapshot was built. */
  updatedAt: string;
}

export interface BuildWorksheetListSnapshotInput {
  names: ReadonlyArray<string>;
  /** Optional now() override for deterministic tests. Default:
   * Date.now(). */
  now?: () => Date;
}

/** Build a fresh worksheet-list snapshot. Empty/duplicate names are
 * preserved — duplicate handling lives in the diff (`findNewWorksheets`
 * treats names as a set). */
export function buildWorksheetListSnapshot(
  input: BuildWorksheetListSnapshotInput,
): WorksheetListSnapshot {
  const now = input.now ?? (() => new Date());
  return {
    names: [...input.names],
    updatedAt: now().toISOString(),
  };
}

/** Returns the names present in `current` but absent from `previous`,
 * preserving the order they appear in `current`. Renames look like
 * `{ remove old, add new }` and fire ONE event for the new name. */
export function findNewWorksheets(
  previous: WorksheetListSnapshot,
  current: ReadonlyArray<string>,
): string[] {
  const seen = new Set(previous.names);
  const out: string[] = [];
  for (const name of current) {
    if (!seen.has(name)) {
      out.push(name);
    }
  }
  return out;
}

function isWindowSlideArtifact(
  key: string,
  previous: BoundedSnapshot,
  current: BoundedSnapshot,
): boolean {
  if (current.keyMode === "keyColumn") return false;

  const keyNum = Number.parseInt(key, 10);
  if (Number.isNaN(keyNum)) return false; // Defensive: positional keys are integers.

  // Special case: empty sheet (windowEnd === 0) — any previous key is
  // a genuine removal (sheet has nothing left, including the key's
  // row). Skip the slide check.
  if (current.windowEnd === 0) return false;

  // Slide artifact iff: key is below the current window's start AND
  // the sheet didn't shrink past it.
  if (keyNum >= current.windowStart && keyNum <= current.windowEnd) {
    // Key is within the current window's range — if it's missing
    // from current.rowHashes, that's a genuine in-window removal.
    return false;
  }
  if (keyNum > current.windowEnd) {
    // Past the current sheet's end — genuine removal (row deleted
    // from the bottom).
    return false;
  }
  // keyNum < current.windowStart → slid out of the front of the
  // window. The row may or may not still exist in the sheet, but
  // either way it's no longer in the snapshot due to bound enforcement,
  // not due to deletion. Suppress.
  // BUT only suppress if the sheet didn't shrink past the original
  // key — if previous rowCount > current rowCount AND the key is
  // beyond the new sheet's end, it's genuine deletion that happened
  // to also fall outside the front-window. This case can't actually
  // occur because keyNum >= current.windowStart is already excluded
  // above; we're in keyNum < current.windowStart territory. If
  // current.windowStart === 1 (no front slide), this branch is
  // unreachable. Reachable only when windowStart > 1, which only
  // happens when sheet grew past the cap → genuine slide.
  void previous; // Reserved for future double-slide diagnostics; not consumed today.
  return true;
}
