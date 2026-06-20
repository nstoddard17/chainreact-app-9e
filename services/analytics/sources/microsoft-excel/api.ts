import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { NotFoundError, surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Bounded, READ-ONLY, METADATA-ONLY Microsoft Excel workbook reader for the analytics
 * source (Slice ANALYTICS-SOURCES-EXCEL-1). Reuses the established Microsoft Graph
 * conventions from the Outlook / OneDrive / OneNote readers (`graphApiBase`,
 * `surfaceGraphError`, `NotFoundError`, `Unauthorized401Error` → refreshAndRetry).
 *
 * Counts the user's `.xlsx` workbook FILES across their drive via a whole-drive search
 * (`/me/drive/root/search(q='xlsx')`) narrowed by the workbook MIME type — a more
 * complete account-wide count than the workflow `workbooksList` wrapper, which lists
 * drive-root children only AND over-fetches name/webUrl/size.
 *
 * PRIVACY: requests `$select=createdDateTime,lastModifiedDateTime,file` ONLY — the
 * `file` facet is read solely to check `file.mimeType` (workbook vs other), then
 * discarded. Each workbook is projected to a transient `{ createdMs, modifiedMs }`.
 * NO workbook contents, worksheet cell values, formulas, ranges, table rows, chart/pivot
 * data, file name, webUrl, size, owner, sharing link, or raw Graph payload is ever read
 * into a fact, returned, or cached. Pagination uses Graph's opaque `@odata.nextLink`.
 *
 * SAFETY: bounded by {@link MAX_PAGES} × {@link PAGE_SIZE}; past the cap the scan stops
 * and reports `truncated: true` rather than scanning an unbounded drive. The MIME type +
 * search term + `$select`/`$top` are server-side constants — no raw Graph query comes
 * from widget config.
 *
 * SCOPES: uses the already-granted `Files.ReadWrite` scope (includes read). No new scope.
 */

export const PAGE_SIZE = 200; // Graph drive search $top.
/** ≤ 25 search pages (≈ 5000 workbooks) before truncation. */
export const MAX_PAGES = 25;

/** OpenXML spreadsheet (`.xlsx`) MIME type. */
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FIELDS = "createdDateTime,lastModifiedDateTime,file";

/** Thrown on HTTP 429 so the adapter can map it to RATE_LIMITED. */
export class ExcelRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcelRateLimitError";
  }
}

/** Transient, non-identifying projection of one workbook file. Never cached/returned. */
export interface WorkbookFact {
  /** createdDateTime epoch ms (null when absent/unparseable). */
  createdMs: number | null;
  /** lastModifiedDateTime epoch ms (null when absent/unparseable). */
  modifiedMs: number | null;
}

export interface WorkbookScanResult {
  facts: WorkbookFact[];
  /** True when the page budget was exhausted before the search finished. */
  truncated: boolean;
}

interface RawItem {
  createdDateTime?: unknown;
  lastModifiedDateTime?: unknown;
  file?: { mimeType?: unknown } | null;
}

function parseMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

async function graphGet(url: string, accessToken: string): Promise<Response> {
  const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) {
    throw new Unauthorized401Error("Microsoft Graph me/drive search GET returned HTTP 401");
  }
  if (res.status === 429) {
    throw new ExcelRateLimitError("Microsoft Graph me/drive search GET rate-limited (HTTP 429)");
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError("drive", surfaceGraphError(text, 404));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Microsoft Graph me/drive search GET failed: ${surfaceGraphError(text, res.status)}`);
  }
  return res;
}

/**
 * Whole-drive scan of the user's `.xlsx` workbooks, projecting each to a
 * {@link WorkbookFact} (`createdMs` / `modifiedMs` only). Items are filtered to the
 * workbook MIME type (the `file` facet is read only for this check, then discarded).
 * Paginates via `@odata.nextLink`, bounded by {@link MAX_PAGES}; `truncated: true` when
 * the budget is exhausted.
 */
export async function scanWorkbooks(
  accessToken: string,
  input: { maxPages?: number } = {},
): Promise<WorkbookScanResult> {
  const maxPages = input.maxPages ?? MAX_PAGES;
  const first = new URL(`${graphApiBase()}/v1.0/me/drive/root/search(q='xlsx')`);
  first.searchParams.set("$select", FIELDS);
  first.searchParams.set("$top", String(PAGE_SIZE));
  let url: string | null = first.toString();
  const facts: WorkbookFact[] = [];
  let truncated = false;

  for (let page = 0; url; page++) {
    if (page >= maxPages) {
      truncated = true;
      break;
    }
    const res = await graphGet(url, accessToken);
    const body = (await res.json()) as { value?: RawItem[]; "@odata.nextLink"?: string };
    for (const raw of body.value ?? []) {
      // Read the `file` facet ONLY to confirm this is an .xlsx workbook, then discard it.
      if (!raw.file || raw.file.mimeType !== XLSX_MIME) continue;
      facts.push({ createdMs: parseMs(raw.createdDateTime), modifiedMs: parseMs(raw.lastModifiedDateTime) });
    }
    url = body["@odata.nextLink"] ?? null;
  }

  return { facts, truncated };
}
