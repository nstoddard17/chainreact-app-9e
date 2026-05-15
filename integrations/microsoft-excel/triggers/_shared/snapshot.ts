import { createHash } from "node:crypto";

/**
 * Shared snapshot helpers for Excel polling triggers.
 *
 * Two snapshot shapes:
 *
 *   - `ExcelRowSnapshot` — row-hash snapshot used by `new_row`,
 *     `new_table_row`, `updated_row`, `updated_table_row`. Shape:
 *
 *       { rowHashes: Record<string, string>, rowCount: number, updatedAt: string }
 *
 *     Only the KEY differs across triggers:
 *       * worksheet position-keyed (`new_row` / `updated_row`): 1-based
 *         row index as a string.
 *       * table stable-id-keyed (`new_table_row` / `updated_table_row`):
 *         Graph's `index` per `tableRowsList`.
 *
 *   - `ExcelWorksheetListSnapshot` — worksheet-name snapshot used by
 *     `new_worksheet`. Shape:
 *
 *       { names: string[], updatedAt: string }
 *
 *     Order is preserved as Graph returns it (workbook order via
 *     `position`), but diffs are set-difference — re-ordering does not
 *     fire the trigger.
 *
 * `hashRow` SHA-256s the canonical JSON of the row's values. Empty
 * trailing cells are part of the canonical form — adding a trailing
 * empty cell with `valuesOnly=true` is invisible (Graph drops it), so
 * we don't double-count.
 */

export interface ExcelRowSnapshot {
  rowHashes: Record<string, string>;
  rowCount: number;
  updatedAt: string;
}

export interface ExcelWorksheetListSnapshot {
  names: string[];
  updatedAt: string;
}

export function hashRow(values: ReadonlyArray<unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex");
}

/** Build a fresh row-hash snapshot from row values keyed by caller-supplied key. */
export function buildSnapshot(
  entries: ReadonlyArray<{ key: string; values: ReadonlyArray<unknown> }>,
): ExcelRowSnapshot {
  const rowHashes: Record<string, string> = {};
  for (const entry of entries) {
    rowHashes[entry.key] = hashRow(entry.values);
  }
  return {
    rowHashes,
    rowCount: entries.length,
    updatedAt: new Date().toISOString(),
  };
}

/** Returns the entries whose key is NEW vs the previous snapshot. */
export function findNewKeys(
  previous: ExcelRowSnapshot,
  current: ReadonlyArray<{ key: string; values: ReadonlyArray<unknown> }>,
): Array<{ key: string; values: ReadonlyArray<unknown> }> {
  const out: Array<{ key: string; values: ReadonlyArray<unknown> }> = [];
  for (const entry of current) {
    if (!Object.prototype.hasOwnProperty.call(previous.rowHashes, entry.key)) {
      out.push(entry);
    }
  }
  return out;
}

/**
 * Returns entries whose key exists in BOTH snapshots but whose hash
 * differs — i.e. the row was updated in place.
 *
 * Used by `updated_row` (worksheet position-keyed) and
 * `updated_table_row` (table stable-id-keyed). Worksheet position-keyed
 * tracking has an accepted limitation: a mid-sheet row insert or delete
 * shifts subsequent rows, so their position-keyed hashes change and
 * every shifted row appears as "updated" — matches V1's behavior at
 * `lib/triggers/pollers/microsoft-excel.ts`. Table stable-id keys do
 * not exhibit this; only true content changes fire the trigger.
 */
export function findChangedKeys(
  previous: ExcelRowSnapshot,
  current: ReadonlyArray<{ key: string; values: ReadonlyArray<unknown> }>,
): Array<{ key: string; values: ReadonlyArray<unknown> }> {
  const out: Array<{ key: string; values: ReadonlyArray<unknown> }> = [];
  for (const entry of current) {
    const previousHash = previous.rowHashes[entry.key];
    if (previousHash === undefined) continue;
    if (previousHash !== hashRow(entry.values)) {
      out.push(entry);
    }
  }
  return out;
}

/** Build a worksheet-name snapshot for `new_worksheet`. */
export function buildWorksheetListSnapshot(
  names: ReadonlyArray<string>,
): ExcelWorksheetListSnapshot {
  return {
    names: [...names],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Returns the names present in `current` but absent from `previous`.
 * Renames look like { remove old name, add new name } from Graph's
 * worksheets endpoint and fire one event for the new name — matches V1.
 */
export function findNewWorksheets(
  previous: ExcelWorksheetListSnapshot,
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
