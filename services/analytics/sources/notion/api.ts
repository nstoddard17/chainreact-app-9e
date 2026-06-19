import { search } from "@/integrations/notion/api/search";

/**
 * Bounded, READ-ONLY Notion page scanner for the analytics source
 * (Slice ANALYTICS-SOURCES-NOTION-1). Reuses the shared `/v1/search` wrapper
 * (same Bearer auth + 401→Unauthorized401Error mapping as the Notion handlers),
 * filtered to `object: page`.
 *
 * PRIVACY: Notion's search response has NO field projection — it always returns
 * full page objects (title, properties, parent, url). This scanner reads ONLY
 * `created_time`, `last_edited_time`, and `archived` from each hit and projects to
 * a transient {@link PageFact}; the title, properties, parent, url, and id are
 * never read into a fact, returned, or cached. The full responses are transient
 * (in-memory for one query) — only the derived numeric aggregates are cached.
 *
 * SAFETY — bounded to prevent an unbounded workspace scan: a HARD page cap
 * ({@link MAX_PAGES} × {@link PAGE_SIZE}). Past the cap we stop and report
 * `truncated: true` rather than walking the whole workspace.
 *
 * No raw search query comes from widget config — `query` is always the empty
 * string ("all accessible pages") and the only filter is the fixed object-type one.
 */

export const PAGE_SIZE = 100;
/** ≤ 10 pages = 1000 page objects per scan before truncation. */
export const MAX_PAGES = 10;

/** Transient, non-identifying projection of one page hit. Never cached/returned to client. */
export interface PageFact {
  /** created_time epoch ms (null when absent/unparseable). */
  createdMs: number | null;
  /** last_edited_time epoch ms (null when absent/unparseable). */
  lastEditedMs: number | null;
  archived: boolean;
}

export interface ScanResult {
  facts: PageFact[];
  /** True when there were more accessible pages than the page cap. */
  truncated: boolean;
}

function parseMs(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Scan accessible page objects, projecting each to a {@link PageFact}. Exact under
 * the cap; `truncated: true` beyond it. Throws `Unauthorized401Error` /
 * `NotFoundError` / generic `Error`; the adapter classifies them.
 */
export async function scanPages(
  accessToken: string,
  input: { maxPages?: number } = {},
): Promise<ScanResult> {
  const maxPages = input.maxPages ?? MAX_PAGES;
  const facts: PageFact[] = [];
  let startCursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const res = await search({
      accessToken,
      query: "",
      filter: { value: "page", property: "object" },
      pageSize: PAGE_SIZE,
      ...(startCursor ? { startCursor } : {}),
    });

    for (const hit of res.results) {
      facts.push({
        createdMs: parseMs(hit.created_time),
        lastEditedMs: parseMs(hit.last_edited_time),
        archived: hit.archived === true,
      });
    }

    if (!res.has_more || !res.next_cursor) return { facts, truncated: false };
    startCursor = res.next_cursor;
    if (page === maxPages - 1) return { facts, truncated: true };
  }

  return { facts, truncated: false };
}
