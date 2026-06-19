import { recordsList } from "@/integrations/airtable/api/records";
import { basesGetSchema } from "@/integrations/airtable/api/bases";

/**
 * Bounded, READ-ONLY Airtable reader for the analytics source
 * (Slice ANALYTICS-SOURCES-AIRTABLE-1).
 *
 * PRIVACY: Airtable's list-records response has no count endpoint and always
 * returns each record's `fields` (cell values). This scanner reads ONLY each
 * record's `createdTime` and projects to a transient {@link RecordFact}; cell
 * values, field names, attachments, comments, collaborators, and the record id are
 * never read into a fact, returned, or cached. The full responses are transient
 * (in-memory for one query) — only the derived numeric aggregates are cached.
 *
 * SAFETY — bounded to prevent an unbounded base scan: a HARD page cap
 * ({@link MAX_PAGES} × {@link PAGE_SIZE}). Past the cap we stop and report
 * `truncated: true` rather than walking the whole table.
 *
 * No raw `filterByFormula` / sort / view is ever taken from widget config — the
 * scanner sends only `pageSize` + the pagination `offset`.
 */

export const PAGE_SIZE = 100; // Airtable's hard per-page ceiling.
/** ≤ 10 pages = 1000 records per scan before truncation. */
export const MAX_PAGES = 10;

/** Transient, non-identifying projection of one record. Never cached/returned to client. */
export interface RecordFact {
  /** createdTime epoch ms (null when absent/unparseable). */
  createdMs: number | null;
}

export interface ScanResult {
  facts: RecordFact[];
  /** True when there were more records than the page cap. */
  truncated: boolean;
}

function parseMs(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Scan a table's records, projecting each to a {@link RecordFact}. Exact under the
 * cap; `truncated: true` beyond it. Throws `Unauthorized401Error` /
 * `IntegrationActionRequiredError` / `NotFoundError` / generic `Error`; the adapter
 * classifies them.
 */
export async function scanRecords(
  accessToken: string,
  baseId: string,
  tableId: string,
  input: { maxPages?: number } = {},
): Promise<ScanResult> {
  const maxPages = input.maxPages ?? MAX_PAGES;
  const facts: RecordFact[] = [];
  let offset: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const res = await recordsList({
      accessToken,
      baseId,
      tableIdOrName: tableId,
      pageSize: PAGE_SIZE,
      ...(offset ? { offset } : {}),
    });

    for (const rec of res.records) {
      facts.push({ createdMs: parseMs(rec.createdTime) });
    }

    if (!res.offset) return { facts, truncated: false };
    offset = res.offset;
    if (page === maxPages - 1) return { facts, truncated: true };
  }

  return { facts, truncated: false };
}

/** Count the tables in a base (Meta API). Only the table COUNT is used by callers. */
export async function fetchTableCount(accessToken: string, baseId: string): Promise<number> {
  const schema = await basesGetSchema({ accessToken, baseId, includeViews: false });
  return schema.tables.length;
}
