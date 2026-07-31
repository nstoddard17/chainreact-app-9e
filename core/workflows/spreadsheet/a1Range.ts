/**
 * Pure A1-notation helpers for guided spreadsheet configuration
 * (SHEETS-GUIDED-CONFIG-1).
 *
 * Google Sheets addresses a write with a single A1 string
 * (`'Email log'!A:F`). Asking a business user to hand-write that is the
 * technical step the guided configuration removes: the builder asks
 * which TAB, and derives the range from it.
 *
 * Everything here is pure string work — no provider calls, no React, no
 * config mutation. The builder owns WHEN these run; this module only
 * answers what a range means and what a tab's range should be.
 *
 * Honesty rule that shapes every function below: when a saved range is
 * ambiguous, the parser returns `null` rather than guessing. A wrong
 * guess would silently point a live workflow at the wrong tab, which is
 * strictly worse than telling the user to pick the tab themselves.
 */

/** Sheets caps columns at ZZZ, so a column reference is 1–3 letters. */
const MAX_COLUMN_LETTERS = 3;

/** `A:Z`, `A:A`, `A:AD` — a whole-column span anchored at column A. */
const ANCHORED_COLUMN_SPAN = /^a:[a-z]{1,3}$/i;

/** `A`, `A1`, `AB12`, `A:Z`, `A1:B2` — range-shaped, NOT a sheet name. */
const CELL_OR_SPAN = new RegExp(
  `^[A-Za-z]{1,${MAX_COLUMN_LETTERS}}[0-9]{0,7}(:[A-Za-z]{1,${MAX_COLUMN_LETTERS}}[0-9]{0,7})?$`,
);

/** `1`, `1:1`, `2:10` — a whole-row reference, NOT a sheet name. */
const ROW_SPAN = /^[0-9]+(:[0-9]+)?$/;

/**
 * Quote a sheet title for A1 notation. The title is ALWAYS quoted
 * (Sheets accepts redundant quotes) and embedded single quotes are
 * doubled — Google's escape rule. This is what keeps titles with
 * spaces, punctuation, or apostrophes ("Bob's Orders") from breaking
 * the range parse.
 *
 * Mirrors `headerRowRange` in the `google-sheets:columns` resolver by
 * design: the picker, the column read, and the derived write range must
 * agree on escaping or they address different tabs.
 */
export function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

/** 1-based column number → A1 letter (1 → A, 27 → AA). */
export function columnLetter(n: number): string {
  let result = "";
  let remaining = n;
  while (remaining > 0) {
    const rem = (remaining - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

/**
 * The append range for a tab — what the guided builder writes into
 * `range` once the user picks a tab.
 *
 * `columnCount` (the number of detected header columns) bounds the span
 * so a sheet wider than 26 columns still receives every value. Without
 * it the span is `A:Z`, Google's documented common shape and the one
 * the action schema's own examples use.
 *
 * Sheets treats this as "find the table inside these columns and append
 * below its bottom row" — which is exactly the promise the guided copy
 * makes, without the user typing notation.
 */
export function deriveAppendRange(
  sheetName: string,
  columnCount?: number,
): string {
  const lastColumn =
    columnCount !== undefined && columnCount > 0
      ? columnLetter(columnCount)
      : "Z";
  return `${quoteSheetName(sheetName)}!A:${lastColumn}`;
}

/**
 * Split a range into its sheet part and its cell part, honoring quoting.
 * Returns `null` when the string is malformed (an unterminated quote, an
 * empty sheet name before `!`).
 */
function splitRange(
  range: string,
): { sheet: string | null; cells: string } | null {
  const trimmed = range.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith("'")) {
    // Quoted title: scan to the closing quote, treating '' as an escaped
    // apostrophe rather than a terminator.
    let i = 1;
    let title = "";
    let closed = false;
    while (i < trimmed.length) {
      const ch = trimmed[i];
      if (ch === "'") {
        if (trimmed[i + 1] === "'") {
          title += "'";
          i += 2;
          continue;
        }
        closed = true;
        i += 1;
        break;
      }
      title += ch;
      i += 1;
    }
    if (!closed) return null; // unterminated quote — malformed
    if (title.length === 0) return null; // '' is not a tab
    const rest = trimmed.slice(i);
    if (rest.length === 0) return { sheet: title, cells: "" };
    if (!rest.startsWith("!")) return null; // junk after the quoted title
    return { sheet: title, cells: rest.slice(1) };
  }

  const bang = trimmed.indexOf("!");
  if (bang === -1) return { sheet: null, cells: trimmed };
  const sheet = trimmed.slice(0, bang);
  if (sheet.length === 0) return null; // "!A:Z" — no tab named
  return { sheet, cells: trimmed.slice(bang + 1) };
}

/** True when a bare token reads as a cell/column/row reference, not a tab. */
function looksLikeCellReference(token: string): boolean {
  return CELL_OR_SPAN.test(token) || ROW_SPAN.test(token);
}

/**
 * Recover the destination tab from a saved A1 range — UI INITIALIZATION
 * ONLY. Never write the result into a saved configuration on open; it
 * exists so the guided step can tell the user which tab their existing
 * range points at.
 *
 * Returns `null` when the answer is not unambiguous:
 *   - `"A:Z"` / `"A1:B2"` / `"1:1"` — a range with no tab in it.
 *   - `"A1"` — syntactically a cell reference; a tab could be named
 *     "A1", but guessing wrong would retarget a live workflow.
 *   - `"'unclosed!A:Z"` / `"!A:Z"` — malformed.
 *
 * A bare token that cannot be a cell reference (`"Sheet1"`, `"Email log"`)
 * IS the tab — that is Google's whole-sheet form, and the action schema
 * documents it.
 */
export function parseSheetNameFromRange(range: string): string | null {
  const parts = splitRange(range);
  if (parts === null) return null;
  if (parts.sheet !== null) {
    const sheet = parts.sheet.trim();
    return sheet.length > 0 ? sheet : null;
  }
  // No `!` — the whole string is either a bare tab name or a range.
  const token = parts.cells.trim();
  if (token.length === 0) return null;
  if (looksLikeCellReference(token)) return null;
  return token;
}

/**
 * True when a range is one the guided builder could have produced — a
 * whole-tab or anchored whole-column span — and may therefore be
 * re-derived when the user picks a different tab.
 *
 * This is the guard that protects a deliberately hand-written range.
 * `'Data'!B2:F10` is a real decision by a real user: it answers `false`
 * here, so changing the tab never silently discards it. The user is told
 * their custom range is in effect and can reset it themselves.
 */
export function isDerivedAppendRange(range: string): boolean {
  const parts = splitRange(range);
  if (parts === null) return false;
  if (parts.sheet === null) {
    // A bare tab name is the whole-sheet default; a bare range is not
    // something this builder ever writes.
    return !looksLikeCellReference(parts.cells.trim()) &&
      parts.cells.trim().length > 0;
  }
  const cells = parts.cells.trim();
  if (cells.length === 0) return true; // `'Tab'` — whole sheet
  return ANCHORED_COLUMN_SPAN.test(cells);
}
