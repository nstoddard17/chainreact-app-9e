import { usersMessagesList } from "@/integrations/gmail/api/usersMessagesList";

/**
 * Bounded, READ-ONLY Gmail message COUNTER for the analytics source (Slice
 * ANALYTICS-SOURCES-GMAIL-1). Reuses the shared `users.messages.list` wrapper
 * (same Bearer auth + 401→Unauthorized401Error mapping as the Gmail handlers).
 *
 * `messages.list` returns only `{id, threadId}` refs — NO bodies, subjects,
 * senders, or recipients. This helper counts the refs and returns ONLY the
 * number; the ids themselves are never returned or stored.
 *
 * SAFETY — bounded to prevent an unbounded inbox scan:
 *   - HARD page cap (`maxPages` × {@link PAGE_SIZE}). Past the cap we stop and
 *     report `truncated: true` (the count becomes "cap+") rather than walking the
 *     whole mailbox.
 */

export const PAGE_SIZE = 100;
/** Scalar metrics (e.g. unread): up to 10 pages = 1000 before truncation. */
export const SCALAR_MAX_PAGES = 10;
/** Per time-bucket counts: up to 3 pages = 300/bucket before truncation. */
export const SERIES_BUCKET_MAX_PAGES = 3;

export interface CountResult {
  count: number;
  /** True when there were more messages than the page cap. */
  truncated: boolean;
}

export interface CountInput {
  q?: string;
  labelIds?: readonly string[];
  maxPages: number;
}

/**
 * Count messages matching `q` (+ optional `labelIds`), paginating up to
 * `maxPages`. Exact under the cap; `truncated: true` beyond it. Throws
 * `Unauthorized401Error` (→ refreshAndRetry) / generic `Error` (→ adapter classifies).
 */
export async function countMessages(
  accessToken: string,
  input: CountInput,
): Promise<CountResult> {
  let count = 0;
  let pageToken: string | undefined;

  for (let page = 0; page < input.maxPages; page++) {
    const result = await usersMessagesList({
      accessToken,
      ...(input.q ? { q: input.q } : {}),
      ...(input.labelIds ? { labelIds: input.labelIds } : {}),
      maxResults: PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
    });

    count += result.messages.length;

    if (!result.nextPageToken) return { count, truncated: false };
    pageToken = result.nextPageToken;
    if (page === input.maxPages - 1) return { count, truncated: true };
  }

  return { count, truncated: false };
}
