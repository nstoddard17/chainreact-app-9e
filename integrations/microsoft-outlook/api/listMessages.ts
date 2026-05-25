import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `GET /me/messages` (or
 * `/me/mailFolders/{folderId}/messages`).
 *
 * Endpoint: GET {base}/v1.0/me/messages
 *           OR {base}/v1.0/me/mailFolders/{folderId}/messages
 * Used by:  fetch_emails action (Outlook Mail 2.2 Commit 3).
 *
 * Owns the `$filter` vs `$search` mutual-exclusion routing — Microsoft
 * Graph rejects requests that combine the two. V1 routing preserved:
 *   - No `query`: server-side `$filter` with `receivedDateTime ge/le` +
 *     `$orderby receivedDateTime desc` + `$top maxResults`.
 *   - `query` present: server-side `$search="<query>"` + `$top =
 *     maxResults * 3` (capped at 100) + NO `$orderby` (also incompatible
 *     with `$search`). Handler applies date filtering client-side after
 *     the response.
 *
 * `ConsistencyLevel: eventual` header is set unconditionally — required
 * for `$search`, harmless for `$filter`-only paths (Graph ignores it).
 *
 * `$select` whitelist is fixed at the wrapper layer — handlers never get
 * the full Graph envelope. Matches V1 [emailActions.ts:551] selection.
 *
 * Paging: single-page only. `@odata.nextLink` is IGNORED. Workflow
 * authors who need >50 results compose multiple fetch_emails calls with
 * date-window slicing. A future iterate_emails action could ship later.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (caught by refreshAndRetry).
 *   - generic `Error` on other failures with Graph error surfaced.
 */

/** Subset of the Graph message envelope returned by the $select whitelist. */
export interface ListMessagesGraphMessage {
  id: string;
  subject?: string | null;
  from?: {
    emailAddress?: { name?: string; address?: string };
  } | null;
  toRecipients?: Array<{
    emailAddress?: { name?: string; address?: string };
  }>;
  ccRecipients?: Array<{
    emailAddress?: { name?: string; address?: string };
  }>;
  receivedDateTime?: string | null;
  bodyPreview?: string | null;
  hasAttachments?: boolean | null;
  importance?: "low" | "normal" | "high" | null;
  isRead?: boolean | null;
}

export interface ListMessagesInput {
  accessToken: string;
  /** When set, scopes to /me/mailFolders/{folderId}/messages. */
  folderId?: string;
  /** Maps to Graph $search="<query>". Mutually exclusive with $filter. */
  query?: string;
  /**
   * Lower-bound ISO 8601. Server-side `$filter ge` when no query;
   * NOT applied at the wrapper layer when query is set (handler applies
   * client-side post-response).
   */
  startDate?: string;
  /** Upper-bound ISO 8601. Same routing as startDate. */
  endDate?: string;
  /** 1..50. Caller already bounded by schema; wrapper re-clamps defensively. */
  maxResults: number;
}

export interface ListMessagesResult {
  /** Graph-shape messages. Handler maps to its bounded output. */
  value: ListMessagesGraphMessage[];
}

const SELECT_FIELDS =
  "id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,hasAttachments,importance,isRead";

export async function listMessages(
  input: ListMessagesInput,
): Promise<ListMessagesResult> {
  // 1. Base URL — folder-scoped vs cross-folder.
  const base =
    input.folderId && input.folderId.length > 0
      ? `${graphApiBase()}/v1.0/me/mailFolders/${encodeURIComponent(
          input.folderId,
        )}/messages`
      : `${graphApiBase()}/v1.0/me/messages`;

  // 2. Bound maxResults defensively (schema layer already constrains
  // 1..50; if a caller bypasses the schema we still won't run away).
  const bounded = Math.max(1, Math.min(input.maxResults, 50));

  // 3. Query params. $select is always present. $top + $orderby +
  // $filter / $search branch on whether `query` is set.
  const params = new URLSearchParams();
  params.append("$select", SELECT_FIELDS);

  const hasQuery =
    typeof input.query === "string" && input.query.trim().length > 0;

  if (hasQuery) {
    // $search path — fetch 3x the requested count (capped at 100) so
    // client-side date filtering has headroom before the slice. NO
    // $orderby (Graph rejects $orderby + $search together).
    params.append("$top", Math.min(bounded * 3, 100).toString());
    params.append("$search", `"${input.query!.trim()}"`);
  } else {
    // $filter path — server-side date filters + $orderby.
    params.append("$top", bounded.toString());
    params.append("$orderby", "receivedDateTime desc");
    const filters: string[] = [];
    if (input.startDate) {
      filters.push(`receivedDateTime ge ${toIso(input.startDate)}`);
    }
    if (input.endDate) {
      filters.push(`receivedDateTime le ${toIso(input.endDate)}`);
    }
    if (filters.length > 0) {
      params.append("$filter", filters.join(" and "));
    }
  }

  const url = `${base}?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      // Required for $search; harmless for $filter (Graph ignores it).
      ConsistencyLevel: "eventual",
    },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph GET me/messages returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph GET me/messages failed: ${surfaceGraphError(
        text,
        res.status,
      )}`,
    );
  }

  return (await res.json()) as ListMessagesResult;
}

/**
 * Normalize an ISO 8601 date string to the form Graph's `$filter`
 * accepts. Graph wants RFC 3339 with `Z` suffix; if the caller passes
 * a different timezone offset we just pass it through (Graph accepts
 * `±HH:MM` offsets too). If the input doesn't parse as a date, we
 * pass it verbatim — Graph will reject it with a clear 400 message
 * via `surfaceGraphError`, which is preferable to silently coercing
 * to "now" or dropping the filter.
 */
function toIso(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toISOString();
}
