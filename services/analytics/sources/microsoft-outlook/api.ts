import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Bounded, READ-ONLY Microsoft Graph message COUNTER for the Outlook analytics
 * source (Slice ANALYTICS-SOURCES-OUTLOOK-1).
 *
 * Deliberately does NOT reuse the workflow `listMessages` wrapper: that wrapper
 * `$select`s subject / from / bodyPreview / recipients, which we must never fetch
 * for analytics. This counter requests `$select=id` ONLY — so the only field that
 * ever crosses the wire is an opaque message id, which is counted (via the page
 * length) and immediately discarded. No body, preview, subject, sender, recipient,
 * web link, or attachment is ever requested, returned, or stored.
 *
 * SAFETY — bounded to prevent an unbounded mailbox scan: a HARD page cap
 * (`maxPages` × {@link PAGE_SIZE}). Past the cap we stop and report
 * `truncated: true` (the count becomes "cap+") rather than walking the whole
 * mailbox/folder.
 *
 * All `$filter` clauses are built server-side by the adapter from approved
 * constants + a validated date window / folder id; this helper never accepts a
 * raw query from widget config.
 */

export const PAGE_SIZE = 100;
/** Scalar metrics (unread / folder count): up to 10 pages = 1000 before truncation. */
export const SCALAR_MAX_PAGES = 10;
/** Per time-bucket counts: up to 3 pages = 300/bucket before truncation. */
export const SERIES_BUCKET_MAX_PAGES = 3;

export interface CountResult {
  count: number;
  /** True when there were more messages than the page cap. */
  truncated: boolean;
}

export interface CountInput {
  /** Well-known folder name ('inbox'|'sentitems') or folder id; undefined = whole mailbox. */
  folder?: string;
  /** Server-owned `$filter` clause (built by the adapter). Optional. */
  filter?: string;
  maxPages: number;
}

function messagesBase(folder?: string): string {
  return folder && folder.length > 0
    ? `${graphApiBase()}/v1.0/me/mailFolders/${encodeURIComponent(folder)}/messages`
    : `${graphApiBase()}/v1.0/me/messages`;
}

/**
 * Count messages matching `filter` in `folder`, paginating up to `maxPages` via
 * `@odata.nextLink`. Exact under the cap; `truncated: true` beyond it. Throws
 * `Unauthorized401Error` (→ refreshAndRetry) / generic `Error` (→ adapter classifies).
 */
export async function countMessages(
  accessToken: string,
  input: CountInput,
): Promise<CountResult> {
  const params = new URLSearchParams();
  params.append("$select", "id");
  params.append("$top", String(PAGE_SIZE));
  if (input.filter) params.append("$filter", input.filter);

  let url: string = `${messagesBase(input.folder)}?${params.toString()}`;
  let count = 0;

  for (let page = 0; page < input.maxPages; page++) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Required when $filter combines with paging/$count on messages; harmless otherwise.
        ConsistencyLevel: "eventual",
      },
    });

    if (res.status === 401) {
      throw new Unauthorized401Error("Microsoft Graph GET messages returned HTTP 401");
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft Graph GET messages failed: ${surfaceGraphError(text, res.status)}`);
    }

    const body = (await res.json()) as { value?: unknown[]; "@odata.nextLink"?: string };
    count += Array.isArray(body.value) ? body.value.length : 0;

    const next = body["@odata.nextLink"];
    if (!next) return { count, truncated: false };
    url = next;
    if (page === input.maxPages - 1) return { count, truncated: true };
  }

  return { count, truncated: false };
}
