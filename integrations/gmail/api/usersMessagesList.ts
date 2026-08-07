import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Gmail's `users.messages.list`.
 *
 * Gmail 2.2 Commit 3: introduced for the `search_emails` action.
 * Returns the lightweight `{id, threadId}` list for a Gmail search;
 * downstream hydration via `usersMessagesGet` produces the full
 * metadata.
 *
 * Same shape rules as the other Gmail API wrappers:
 *   - Throws `Unauthorized401Error` on HTTP 401 so the
 *     `refreshAndRetry` wrapper can trigger one refresh + retry.
 *   - Other HTTP errors propagate with Google's error `message` /
 *     `status` surfaced when present.
 *
 * Endpoint: GET {GMAIL_API_BASE}/gmail/v1/users/me/messages
 * Query params:
 *   - `q` (optional, but the handler always provides one): Gmail
 *     search query syntax string. Forwarded verbatim — V2 does not
 *     mutate the caller's query.
 *   - `maxResults` (optional, 1..500): per-page cap. Gmail's
 *     server-side default (when omitted) is 100.
 *   - `pageToken` (optional): for continuing a paginated search.
 *
 * Scope requirement: covered by `gmail.modify` (the manifest's sole scope).
 *
 * Pagination policy: single-page only. The `search_emails` handler
 * does NOT auto-loop through pages — workflow authors who want
 * additional pages pass the returned `nextPageToken` back in as the
 * next call's `pageToken`.
 */

function gmailApiBase(): string {
  return process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
}

export interface UsersMessagesListInput {
  /** Decrypted access token; supplied by `refreshAndRetry`. */
  accessToken: string;
  /** Gmail search query syntax. Forwarded verbatim. */
  q?: string;
  /**
   * Restrict to messages carrying ALL of these label ids (Gmail's `labelIds`
   * repeatable param). Added for the analytics label-count metric — lets a count
   * pin to a label by id without relying on `label:<name>` normalization. Each id
   * is forwarded as a separate `labelIds` query param.
   */
  labelIds?: readonly string[];
  /** Per-page cap; 1..500. Gmail's default when omitted is 100. */
  maxResults?: number;
  /** Token from a prior page's `nextPageToken` to continue paginating. */
  pageToken?: string;
}

export interface GmailMessageRef {
  id: string;
  threadId: string;
}

export interface UsersMessagesListResult {
  messages: readonly GmailMessageRef[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export async function usersMessagesList(
  input: UsersMessagesListInput,
): Promise<UsersMessagesListResult> {
  const params = new URLSearchParams();
  if (input.q !== undefined && input.q.length > 0) {
    params.set("q", input.q);
  }
  if (input.labelIds !== undefined) {
    for (const labelId of input.labelIds) {
      if (labelId.length > 0) params.append("labelIds", labelId);
    }
  }
  if (input.maxResults !== undefined) {
    params.set("maxResults", String(input.maxResults));
  }
  if (input.pageToken !== undefined && input.pageToken.length > 0) {
    params.set("pageToken", input.pageToken);
  }

  const url = `${gmailApiBase()}/gmail/v1/users/me/messages${
    params.toString().length > 0 ? `?${params.toString()}` : ""
  }`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Gmail users.messages.list returned HTTP 401",
    );
  }

  if (!res.ok) {
    const text = await res.text();
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as GmailErrorPayload;
      if (parsed?.error?.message) {
        detail = parsed.error.message;
      } else if (parsed?.error?.status) {
        detail = parsed.error.status;
      }
    } catch {
      // not JSON — keep HTTP status
    }
    throw new Error(`Gmail messages.list failed: ${detail}`);
  }

  const json = (await res.json()) as {
    messages?: GmailMessageRef[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  };

  return {
    messages: json.messages ?? [],
    nextPageToken: json.nextPageToken,
    resultSizeEstimate: json.resultSizeEstimate,
  };
}
