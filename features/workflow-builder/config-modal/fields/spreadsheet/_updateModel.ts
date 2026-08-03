/**
 * The three-state column model behind record-shaped spreadsheet updates
 * (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * Append actions and update actions ask genuinely different questions. When
 * a row is being CREATED every column starts empty, so "leave it blank" and
 * "write nothing" are the same thing. When a row is being EDITED they are
 * not: a blank cell could mean *leave this column alone* or *erase what is
 * in it*, and those write different things to a customer's spreadsheet.
 *
 * Excel `update_row` makes all three outcomes distinct at run time:
 *
 *   | Intent          | Saved config           | Handler result          |
 *   |-----------------|------------------------|-------------------------|
 *   | Leave unchanged | key ABSENT             | existing cell preserved |
 *   | Set to blank    | key present, `""`      | cell cleared            |
 *   | Set to a value  | key present, the value | cell written            |
 *
 * So the editor models three states rather than interpreting an empty text
 * box, and this module is where that interpretation is pinned — pure and
 * jsdom-free, so the rules are testable without rendering.
 *
 * Everything here is deliberately provider-agnostic. It knows about column
 * names, records and cell states; it knows nothing about Excel, Graph, or
 * any action key.
 */

/** What the user chose for one detected column. */
export type UpdateCellState = "unchanged" | "blank" | "value";

export interface UpdateCell {
  /**
   * The column's identity: the RAW header text, exactly as the runtime
   * handler will match it. Never the trimmed display label — a picker that
   * "tidied" the spelling would author a key the handler rejects.
   */
  readonly column: string;
  readonly state: UpdateCellState;
  /** Authored content for `value`. Empty for the other two states. */
  readonly value: string;
  /**
   * The EXACT value this cell was hydrated from, kept while the cell is
   * untouched, and emitted verbatim on commit.
   *
   * This is what makes reopening a saved node non-destructive. Without it,
   * editing one column would silently rewrite every OTHER column in the
   * record through the editor's string round-trip: a saved `26` would come
   * back as `"26"`, and a legacy `null` (which an API or AI author may
   * legitimately have written, and which the handler treats as a clear)
   * would come back as `""`. Both change the stored config for a user who
   * only touched a different column. Editing a cell drops `saved`, because
   * at that point the authored value IS the intent.
   */
  readonly saved?: unknown;
}

/**
 * Why a detected column cannot be offered as a safe update target.
 *
 *   - `duplicate-name` — two header cells hold the identical raw text. A
 *     record is keyed by name, so there is no way to say WHICH of them to
 *     write. The runtime handler's header map silently last-wins; offering
 *     either would be picking for the user and hoping.
 *   - `duplicate-label` — the raw headers differ but read identically once
 *     trimmed (`"Name"` and `"Name "`). Each is individually targetable, but
 *     the user cannot tell the two rows apart on screen, so choosing one is
 *     a coin flip they don't know they are making.
 */
export type ColumnAmbiguity = "none" | "duplicate-name" | "duplicate-label";

export interface DetectedColumn {
  /** Raw header text — the handler's key. */
  readonly value: string;
  /** Display text, which may be trimmed for presentation. */
  readonly label: string;
  /** e.g. "Column B". */
  readonly hint?: string | undefined;
}

export interface ClassifiedColumn extends DetectedColumn {
  readonly ambiguity: ColumnAmbiguity;
  /** True when the raw header differs from its display label. */
  readonly hasHiddenWhitespace: boolean;
}

/**
 * Mark every detected column that cannot be targeted unambiguously.
 *
 * Nothing is dropped: a duplicate stays in the list and is SHOWN, because
 * silently hiding one of a customer's columns is how a picker starts lying
 * about what is in their sheet. The UI refuses to configure it and says
 * why.
 */
export function classifyColumns(
  columns: readonly DetectedColumn[],
): readonly ClassifiedColumn[] {
  const rawCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();
  for (const column of columns) {
    rawCounts.set(column.value, (rawCounts.get(column.value) ?? 0) + 1);
    labelCounts.set(column.label, (labelCounts.get(column.label) ?? 0) + 1);
  }

  return columns.map((column) => {
    const ambiguity: ColumnAmbiguity =
      (rawCounts.get(column.value) ?? 0) > 1
        ? "duplicate-name"
        : (labelCounts.get(column.label) ?? 0) > 1
          ? "duplicate-label"
          : "none";
    return {
      ...column,
      ambiguity,
      hasHiddenWhitespace: column.value !== column.label,
    };
  });
}

/** True when a saved config value is a column-keyed record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Render a saved cell value as editable text. Only used for the `value`
 * state; the `saved` field carries the untouched original for commit, so
 * this stringification never reaches the stored config unless the user
 * actually edits the cell.
 */
function displayValue(value: unknown): string {
  return typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : "";
}

/**
 * Hydrate one cell per detected column from a saved record.
 *
 * The mapping is by NAME, never by position, so reordering a worksheet's
 * columns cannot change what a saved configuration means.
 *
 * `null` is read as UNCHANGED, not as "set to blank"
 * (EXCEL-UPDATE-ROW-CONCURRENCY-4).
 *
 * S3 shipped the opposite reading, on the belief that the handler wrote
 * null through to clear the cell. The S4 audit checked that against
 * Microsoft's documentation and found it backwards: a `null` inside a
 * values array is an instruction to leave the cell alone — "No update
 * takes place to the intended target (cell) when null input is sent"
 * (https://learn.microsoft.com/en-us/graph/api/resources/excel). So a node
 * saved with `null` has never cleared anything, and the editor was telling
 * its author it would.
 *
 * The key is still PRESERVED rather than dropped: `saved: null` rides along
 * and is re-emitted verbatim on commit, so opening a legacy node and saving
 * it changes nothing. The user can convert it deliberately — choosing "Set
 * to blank" writes `""`, choosing "Set to a value" writes a value — but
 * nothing is normalized on their behalf.
 *
 * The editor still never AUTHORS null. `""` remains the one clearing
 * representation the builder emits.
 */
export function recordToUpdateCells(
  value: unknown,
  columns: readonly string[],
): readonly UpdateCell[] {
  const record = isRecord(value) ? value : {};
  return columns.map((column) => {
    if (!Object.prototype.hasOwnProperty.call(record, column)) {
      return { column, state: "unchanged" as const, value: "" };
    }
    const cell = record[column];
    if (cell === null) {
      // Unchanged, but the key stays in the saved record — see `saved`.
      return { column, state: "unchanged" as const, value: "", saved: null };
    }
    if (cell === "") {
      return { column, state: "blank" as const, value: "", saved: cell };
    }
    return {
      column,
      state: "value" as const,
      value: displayValue(cell),
      saved: cell,
    };
  });
}

/**
 * True when this cell is an untouched legacy `null` — present in the saved
 * record, meaning "leave this cell alone", and preserved as-is.
 *
 * The UI uses this to say so, rather than leaving the user wondering why a
 * column reads as unchanged but the step still mentions it.
 */
export function isLegacyPreservedNull(cell: UpdateCell): boolean {
  return cell.state === "unchanged" && "saved" in cell && cell.saved === null;
}

/**
 * Saved keys that match no detected column — a column that was renamed or
 * deleted in the spreadsheet after this node was configured.
 *
 * These are NEVER dropped. The runtime handler fails loudly on a key it
 * cannot resolve, so quietly deleting it would turn a visible, fixable
 * problem into a config that silently stopped doing what its author asked.
 * The UI shows them, preserves them, and blocks readiness.
 */
export function staleRecordEntries(
  value: unknown,
  columns: readonly string[],
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return {};
  const known = new Set(columns);
  const stale: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!known.has(key)) stale[key] = entry;
  }
  return stale;
}

/**
 * Commit the three-state cells back as a column-keyed record.
 *
 *   - `unchanged` → the key is OMITTED. That omission is the whole point:
 *     it is what tells the handler to preserve the existing cell.
 *   - `blank` → `""` (or the untouched `saved` value, so a legacy `null`
 *     survives).
 *   - `value` → the authored content (or the untouched `saved` value, so a
 *     saved number stays a number).
 *
 * Stale entries are re-emitted verbatim so reopening and saving a node can
 * never silently drop a key the user has not been told about.
 *
 * Returns `undefined` when nothing at all would be written, so the key drops
 * out of the config rather than committing `{}` — which the runtime schema
 * rejects, and which readiness names in product language first.
 */
export function updateCellsToRecord(
  cells: readonly UpdateCell[],
  staleEntries: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> | undefined {
  const record: Record<string, unknown> = {};
  for (const cell of cells) {
    if (cell.state === "unchanged") {
      // An untouched legacy `null` is UNCHANGED and yet still has a key in
      // the saved record. Re-emit it verbatim rather than dropping it:
      // deleting a key the user has not been asked about would edit their
      // saved node just for opening it. Its runtime meaning already matches
      // its new label — Graph skips a null cell — so preserving it costs
      // nothing and silently rewriting it would be the surprise.
      // (EXCEL-UPDATE-ROW-CONCURRENCY-4.)
      if ("saved" in cell) record[cell.column] = cell.saved;
      continue;
    }
    if ("saved" in cell) {
      record[cell.column] = cell.saved;
      continue;
    }
    record[cell.column] = cell.state === "blank" ? "" : cell.value;
  }
  for (const [key, entry] of Object.entries(staleEntries)) {
    record[key] = entry;
  }
  return Object.keys(record).length === 0 ? undefined : record;
}

/**
 * Columns the user started to answer and left half-finished: "Set to a
 * value" chosen, no value given.
 *
 * This must never be silently downgraded to "Set to blank". They are
 * different writes — one puts content in a cell, the other erases it — and
 * a user who stopped half-way has expressed neither. Readiness names the
 * column and offers both real choices instead.
 */
export function incompleteValueColumns(
  cells: readonly UpdateCell[],
): readonly string[] {
  return cells
    .filter((cell) => cell.state === "value" && cell.value.trim().length === 0)
    .map((cell) => cell.column);
}

/** Columns that will actually be written (set or cleared). */
export function changedColumns(
  cells: readonly UpdateCell[],
): readonly UpdateCell[] {
  return cells.filter((cell) => cell.state !== "unchanged");
}

/**
 * Configured columns whose target is ambiguous — the saved record names a
 * column that appears more than once, so the run would write to whichever
 * one the handler's header map happened to keep.
 */
export function ambiguousConfiguredColumns(
  cells: readonly UpdateCell[],
  classified: readonly ClassifiedColumn[],
): readonly string[] {
  const ambiguous = new Set(
    classified.filter((c) => c.ambiguity !== "none").map((c) => c.value),
  );
  return changedColumns(cells)
    .filter((cell) => ambiguous.has(cell.column))
    .map((cell) => cell.column);
}
