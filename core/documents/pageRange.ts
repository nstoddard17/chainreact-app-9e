/**
 * Page-range parsing for document analysis (AI-PROVIDER-PLAN-1 §4.6).
 *
 * Grammar: comma-separated terms, each a single 1-based page ("8") or an
 * inclusive ascending range ("2-5"). Whitespace around terms is
 * tolerated. Examples: "3" · "1-5" · "1-3, 7, 9-10".
 *
 * Pure math — parsers apply the resulting selection to their own
 * segment lists. Invalid input throws the typed `PageRangeError` so
 * callers can surface a config-level message (never a crash).
 */

/**
 * Upper bound on how many pages one selection may expand to. Guards
 * against "1-999999999" allocating an enormous array; real documents
 * this size fail the byte/char budgets long before this matters.
 */
export const PAGE_RANGE_MAX_PAGES = 10_000;

export class PageRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageRangeError";
  }
}

const TERM_PATTERN = /^(\d+)(?:\s*-\s*(\d+))?$/;

/**
 * Parse a page-range expression into a sorted, de-duplicated list of
 * 1-based page numbers.
 */
export function parsePageRange(input: string): number[] {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new PageRangeError("Page range is empty.");
  }
  const pages = new Set<number>();
  for (const rawTerm of trimmed.split(",")) {
    const term = rawTerm.trim();
    if (term.length === 0) {
      throw new PageRangeError(
        `Page range "${trimmed}" has an empty entry between commas.`,
      );
    }
    const match = TERM_PATTERN.exec(term);
    const startText = match?.[1];
    if (!match || startText === undefined) {
      throw new PageRangeError(
        `"${term}" is not a page number or range (use forms like "3" or "1-5").`,
      );
    }
    const start = Number.parseInt(startText, 10);
    const end = match[2] === undefined ? start : Number.parseInt(match[2], 10);
    if (start < 1) {
      throw new PageRangeError("Page numbers start at 1.");
    }
    if (end < start) {
      throw new PageRangeError(
        `Range "${term}" is reversed — the end page must not be smaller than the start page.`,
      );
    }
    if (end - start + 1 > PAGE_RANGE_MAX_PAGES || pages.size + (end - start + 1) > PAGE_RANGE_MAX_PAGES) {
      throw new PageRangeError(
        `Page range selects more than ${PAGE_RANGE_MAX_PAGES} pages.`,
      );
    }
    for (let page = start; page <= end; page += 1) {
      pages.add(page);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export interface PageSelection {
  /** Requested pages that exist (1-based, sorted). */
  readonly selected: number[];
  /** Requested pages beyond the document's page count (sorted). */
  readonly outOfRange: number[];
}

/**
 * Intersect requested pages with a document's actual page count.
 * Out-of-range pages are reported, not silently dropped — the parser
 * turns a non-empty `outOfRange` into a warning, and an empty
 * `selected` into a typed error.
 */
export function selectPages(
  requestedPages: readonly number[],
  totalPages: number,
): PageSelection {
  const selected: number[] = [];
  const outOfRange: number[] = [];
  for (const page of requestedPages) {
    if (page <= totalPages) selected.push(page);
    else outOfRange.push(page);
  }
  return { selected, outOfRange };
}
