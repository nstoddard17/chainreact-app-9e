/**
 * Pure value-shape helpers for the `spreadsheet-rows` composite editor
 * (SPREADSHEET-CONFIG-REDESIGN-1).
 *
 * The editor renders CELLS (strings keyed by column position / column
 * name); the saved config keeps the EXISTING runtime shapes untouched:
 *
 *   - "One row"      → positional `string[]` (Excel add_row `values`).
 *     In-between blanks are preserved as `""` so later cells stay
 *     aligned to their worksheet columns; TRAILING blanks are trimmed
 *     (the handler pads the tail with null to the sheet's column count).
 *     All-blank → `undefined` so the optional key drops out of the
 *     config entirely (matters for either-or refinements like Excel
 *     `values` XOR `rows`).
 *
 *   - "Several rows" → `Array<Record<columnHeader, cellValue>>` (Excel
 *     add_row `rows`). Blank cells are OMITTED from each record (the
 *     handler fills unnamed columns with null); rows with no filled
 *     cells are skipped (the runtime schema rejects empty records); no
 *     rows at all → `undefined`.
 *
 * Everything here is pure and jsdom-free so the shape contract is
 * unit-testable without rendering.
 */

/** Hydrate the one-row editor's cells from a saved positional value. */
export function positionalValuesToCells(
  value: unknown,
  cellCount: number,
): string[] {
  const source = Array.isArray(value) ? value : [];
  const length = Math.max(cellCount, source.length);
  const cells: string[] = [];
  for (let i = 0; i < length; i++) {
    const cell = source[i];
    cells.push(
      typeof cell === "string"
        ? cell
        : typeof cell === "number" || typeof cell === "boolean"
          ? String(cell)
          : "",
    );
  }
  return cells;
}

/**
 * Commit the one-row editor's cells as the positional save shape.
 * Trailing blanks trimmed; in-between blanks kept as "" for alignment;
 * all blank → undefined.
 */
export function cellsToPositionalValues(
  cells: readonly string[],
): string[] | undefined {
  let lastFilled = -1;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]!.trim().length > 0) lastFilled = i;
  }
  if (lastFilled === -1) return undefined;
  return cells.slice(0, lastFilled + 1).map((c) => c);
}

/** Hydrate the several-rows grid from a saved header-keyed batch value. */
export function batchRowsToGrid(
  columns: readonly string[],
  value: unknown,
): string[][] {
  if (!Array.isArray(value)) return [];
  const grid: string[][] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    grid.push(
      columns.map((col) => {
        const cell = record[col];
        return typeof cell === "string"
          ? cell
          : typeof cell === "number" || typeof cell === "boolean"
            ? String(cell)
            : "";
      }),
    );
  }
  return grid;
}

/**
 * Commit the several-rows grid as the header-keyed save shape. Blank
 * cells omitted per record; all-blank rows skipped; nothing left →
 * undefined.
 */
export function gridToBatchRows(
  columns: readonly string[],
  grid: ReadonlyArray<readonly string[]>,
): Array<Record<string, string>> | undefined {
  const rows: Array<Record<string, string>> = [];
  for (const gridRow of grid) {
    const record: Record<string, string> = {};
    for (let c = 0; c < columns.length; c++) {
      const cell = gridRow[c] ?? "";
      if (cell.trim().length === 0) continue;
      record[columns[c]!] = cell;
    }
    if (Object.keys(record).length > 0) rows.push(record);
  }
  return rows.length === 0 ? undefined : rows;
}

/**
 * Drop schema-invalid empty records from a batch value (the runtime
 * schema rejects `{}` rows). Used when the manual fallback row builder
 * commits through the composite editor. Nothing left → undefined.
 */
export function dropEmptyBatchRecords(
  value: unknown,
): Array<Record<string, string>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.filter(
    (entry): entry is Record<string, string> =>
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      Object.keys(entry).length > 0,
  );
  return rows.length === 0 ? undefined : rows;
}
