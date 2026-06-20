import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { NotFoundError, surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Bounded, READ-ONLY, COUNT-ONLY + METADATA-ONLY Microsoft OneNote reader for the
 * analytics source (Slice ANALYTICS-SOURCES-ONENOTE-1). Reuses the established
 * Microsoft Graph conventions from the Outlook / OneDrive / Teams readers
 * (`graphApiBase`, `surfaceGraphError`, `NotFoundError`, `Unauthorized401Error` →
 * refreshAndRetry).
 *
 * PRIVACY: deliberately does NOT reuse the workflow `pagesList` wrapper — that fetches
 * full OneNote page objects (title, links, contentUrl, createdByAppId, …). This reader
 * requests the absolute minimum field masks:
 *   - notebooks / sections: `$select=id` (count only — id is never returned/cached).
 *   - pages: `$select=createdDateTime,lastModifiedDateTime` and projects each page to a
 *     transient `{ createdMs, modifiedMs }` fact.
 * NO page title, content, preview text, contentUrl, webUrl, links, attachments,
 * comments, createdBy/lastModifiedBy, or any raw Graph payload is ever read into a
 * fact, returned, or cached.
 *
 * SAFETY — bounded to prevent an unbounded notebook/page scan: notebook + section lists
 * are paged up to {@link LIST_MAX_PAGES}; the account-wide page scan is paged up to
 * {@link PAGES_MAX_PAGES} × {@link PAGE_SIZE}; `truncated: true` is reported when a
 * budget is exhausted rather than scanning everything.
 *
 * No raw Graph query comes from widget config — these are fixed `me/onenote/*` reads
 * with server-side `$select` / `$top` constants (no notebook/section filter in v1).
 */

export const PAGE_SIZE = 100; // Graph OneNote pages $top max.
/** Account-wide page scan: up to 25 pages = 2500 pages before truncation. */
export const PAGES_MAX_PAGES = 25;
/** Notebook / section list paging cap (these lists are small). */
export const LIST_MAX_PAGES = 10;

/** Thrown on HTTP 429 so the adapter can map it to RATE_LIMITED. */
export class OneNoteRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OneNoteRateLimitError";
  }
}

function parseMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

async function graphGet(url: string, accessToken: string, resource: string): Promise<Response> {
  const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) {
    throw new Unauthorized401Error(`Microsoft Graph ${resource} GET returned HTTP 401`);
  }
  if (res.status === 429) {
    throw new OneNoteRateLimitError(`Microsoft Graph ${resource} GET rate-limited (HTTP 429)`);
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(resource, surfaceGraphError(text, 404));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Microsoft Graph ${resource} GET failed: ${surfaceGraphError(text, res.status)}`);
  }
  return res;
}

export interface CountResult {
  count: number;
  /** True when the list paging budget was exhausted before the list finished. */
  truncated: boolean;
}

/** Count items of a `me/onenote/{notebooks|sections}` collection (id-only $select). */
async function countCollection(
  accessToken: string,
  collection: "notebooks" | "sections",
): Promise<CountResult> {
  const first = new URL(`${graphApiBase()}/v1.0/me/onenote/${collection}`);
  first.searchParams.set("$select", "id");
  first.searchParams.set("$top", String(PAGE_SIZE));
  let url: string | null = first.toString();
  let count = 0;
  let truncated = false;

  for (let page = 0; url; page++) {
    if (page >= LIST_MAX_PAGES) {
      truncated = true;
      break;
    }
    const res = await graphGet(url, accessToken, `onenote ${collection}`);
    const body = (await res.json()) as { value?: unknown[]; "@odata.nextLink"?: string };
    count += Array.isArray(body.value) ? body.value.length : 0;
    url = body["@odata.nextLink"] ?? null;
  }

  return { count, truncated };
}

/** Count the user's OneNote notebooks. */
export function countNotebooks(accessToken: string): Promise<CountResult> {
  return countCollection(accessToken, "notebooks");
}

/** Count the user's OneNote sections (across all notebooks). */
export function countSections(accessToken: string): Promise<CountResult> {
  return countCollection(accessToken, "sections");
}

/** Transient, non-identifying projection of one OneNote page. Never cached/returned. */
export interface PageFact {
  /** createdDateTime epoch ms (null when absent/unparseable). */
  createdMs: number | null;
  /** lastModifiedDateTime epoch ms (null when absent/unparseable). */
  modifiedMs: number | null;
}

export interface PageScanResult {
  facts: PageFact[];
  /** True when the page-scan budget was exhausted before the list finished. */
  truncated: boolean;
}

interface RawPage {
  createdDateTime?: unknown;
  lastModifiedDateTime?: unknown;
}

/**
 * Account-wide scan of `me/onenote/pages`, projecting each page to a {@link PageFact}
 * (`createdMs` / `modifiedMs` only). Requests `$select=createdDateTime,
 * lastModifiedDateTime` — no title, content, links, or author. Paginates via
 * `@odata.nextLink`, bounded by {@link PAGES_MAX_PAGES}; `truncated: true` when the
 * budget is exhausted.
 */
export async function scanPageTimestamps(
  accessToken: string,
  input: { maxPages?: number } = {},
): Promise<PageScanResult> {
  const maxPages = input.maxPages ?? PAGES_MAX_PAGES;
  const first = new URL(`${graphApiBase()}/v1.0/me/onenote/pages`);
  first.searchParams.set("$select", "createdDateTime,lastModifiedDateTime");
  first.searchParams.set("$top", String(PAGE_SIZE));
  let url: string | null = first.toString();
  const facts: PageFact[] = [];
  let truncated = false;

  for (let page = 0; url; page++) {
    if (page >= maxPages) {
      truncated = true;
      break;
    }
    const res = await graphGet(url, accessToken, "onenote pages");
    const body = (await res.json()) as { value?: RawPage[]; "@odata.nextLink"?: string };
    for (const raw of body.value ?? []) {
      facts.push({ createdMs: parseMs(raw.createdDateTime), modifiedMs: parseMs(raw.lastModifiedDateTime) });
    }
    url = body["@odata.nextLink"] ?? null;
  }

  return { facts, truncated };
}
