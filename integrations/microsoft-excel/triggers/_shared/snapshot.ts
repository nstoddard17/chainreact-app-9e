import { createHash } from "node:crypto";

/**
 * Shared snapshot helpers for Excel polling triggers.
 *
 * Both `new_row` (worksheet position-keyed) and `new_table_row`
 * (table stable-id-keyed) use the same on-disk shape:
 *
 *   { rowHashes: Record<string, string>, rowCount: number, updatedAt: string }
 *
 * Only the KEY differs:
 *   - worksheet rows: the 1-based row index as a string.
 *   - table rows: Graph's stable `index` per `tableRowsList`.
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

export function hashRow(values: ReadonlyArray<unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex");
}

/** Build a fresh snapshot from row values keyed by caller-supplied key. */
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
