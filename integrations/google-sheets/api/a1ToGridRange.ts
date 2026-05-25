/**
 * Convert an A1 cell-or-range reference into Sheets' GridRange shape.
 *
 * Used by Sheets 2.2's `format_range` action to translate the
 * user-facing A1 syntax (`A1`, `A1:B5`, `AA10:AB12`) into the
 * 0-indexed half-open `GridRange` shape Sheets' `repeatCell` request
 * expects.
 *
 * GridRange semantics (per Sheets API docs):
 *   - `startRowIndex` / `startColumnIndex` are 0-indexed and inclusive.
 *   - `endRowIndex` / `endColumnIndex` are 0-indexed and EXCLUSIVE.
 *
 * So `A1` becomes `{ start: 0, end: 1 }` on both dimensions — the cell
 * occupies row 0 and column 0, with the end index pointing at the
 * next-after-occupied position.
 *
 * NOT supported (rejected with `InvalidA1RangeError`):
 *   - Full-column refs (`A:A`) — would map to `startRowIndex: undefined`.
 *   - Full-row refs (`1:1`) — same problem on the other axis.
 *   - Sheet-prefixed refs (`Sheet1!A1`) — `format_range`'s schema
 *     keeps `sheetName` separate; combined refs are rejected at the
 *     schema layer before this helper sees them.
 *   - Lowercase column letters (`a1`) — strict-case A-Z only.
 *
 * Caller adds the `sheetId` field separately when building the
 * `repeatCell` request; this helper is pure (no I/O, no
 * sheetId dependency).
 */

export class InvalidA1RangeError extends Error {
  readonly input: string;
  constructor(input: string, detail?: string) {
    super(
      `Invalid A1 range '${input}'${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "InvalidA1RangeError";
    this.input = input;
  }
}

export interface GridRange {
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
}

/**
 * Pinned regex for the supported A1 surface:
 *   single cell: `[A-Z]+[1-9][0-9]*`
 *   range:       `[A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*`
 *
 * Row numbers are 1-indexed positive integers (Sheets has no row 0;
 * `A0` is rejected).
 */
const A1_CELL = /^([A-Z]+)([1-9][0-9]*)$/;
const A1_RANGE = /^([A-Z]+)([1-9][0-9]*):([A-Z]+)([1-9][0-9]*)$/;

function columnLettersToIndex(letters: string): number {
  // A = 0, B = 1, ..., Z = 25, AA = 26, AB = 27, ...
  let index = 0;
  for (const ch of letters) {
    index = index * 26 + (ch.charCodeAt(0) - 64); // 'A' = 65
  }
  return index - 1;
}

export function a1ToGridRange(a1: string): GridRange {
  if (!a1 || typeof a1 !== "string") {
    throw new InvalidA1RangeError(String(a1), "input must be a non-empty string");
  }
  // Sheet-prefixed refs explicitly rejected — `format_range`'s schema
  // keeps `sheetName` separate; combined refs are a schema error.
  if (a1.includes("!")) {
    throw new InvalidA1RangeError(
      a1,
      "must not include a sheet-name prefix (sheetName is a separate field)",
    );
  }

  const rangeMatch = a1.match(A1_RANGE);
  if (rangeMatch) {
    const [, startColLetters, startRow, endColLetters, endRow] = rangeMatch;
    const startColumnIndex = columnLettersToIndex(startColLetters!);
    const endColumnIndex = columnLettersToIndex(endColLetters!) + 1;
    const startRowIndex = Number.parseInt(startRow!, 10) - 1;
    const endRowIndex = Number.parseInt(endRow!, 10);

    if (startColumnIndex > endColumnIndex - 1) {
      throw new InvalidA1RangeError(
        a1,
        "start column must come before or equal end column",
      );
    }
    if (startRowIndex > endRowIndex - 1) {
      throw new InvalidA1RangeError(
        a1,
        "start row must come before or equal end row",
      );
    }
    return { startRowIndex, endRowIndex, startColumnIndex, endColumnIndex };
  }

  const cellMatch = a1.match(A1_CELL);
  if (cellMatch) {
    const [, colLetters, row] = cellMatch;
    const startColumnIndex = columnLettersToIndex(colLetters!);
    const startRowIndex = Number.parseInt(row!, 10) - 1;
    return {
      startRowIndex,
      endRowIndex: startRowIndex + 1,
      startColumnIndex,
      endColumnIndex: startColumnIndex + 1,
    };
  }

  throw new InvalidA1RangeError(
    a1,
    "must be a single A1 cell (e.g. 'A1') or A1 range (e.g. 'A1:B5')",
  );
}
