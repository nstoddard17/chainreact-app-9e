import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Gmail's `users.messages.get`.
 *
 * Slice 2e: hydrates a message id discovered via `users.history.list`.
 * Format = `metadata` (Slice 2 default) — returns headers, labelIds,
 * snippet, internalDate, sizeEstimate, mimeType but NOT the body.
 *
 * Tradeoffs of the metadata default:
 *   - The TriggerEvent payload omits the email body. Workflows that need
 *     body-based logic must add a future GetEmail action node.
 *   - `payload.parts` is not in metadata responses, so V1's exact
 *     attachment-detection (walks payload.parts looking for filenames) is
 *     not reproducible from metadata responses alone. The new_email
 *     trigger uses a top-level mimeType heuristic in filters.ts.
 *
 * Gmail 2.3 Commit 4 — added optional `format` parameter to support the
 * new_attachment trigger, which must enumerate attachment metadata at the
 * trigger boundary. `format="full"` requests the full payload tree
 * (including `payload.parts`); when `format="full"`, `metadataHeaders` is
 * NOT sent (the Gmail API only honors that arg with format=metadata, and
 * full responses already include all headers under `payload.headers`).
 * Omitting `format` keeps the pre-existing behavior verbatim
 * (`format=metadata` + default metadata headers).
 *
 * Endpoint: GET {GMAIL_API_BASE}/gmail/v1/users/me/messages/{id}?format=metadata|full
 */

function gmailApiBase(): string {
  return process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
}

export interface UsersMessagesGetInput {
  /** Decrypted access token; supplied by `refreshAndRetry`. */
  accessToken: string;
  /** Gmail message id (from history.list). */
  messageId: string;
  /**
   * Header names to extract. Gmail honors this when format=metadata.
   * Slice 2e default covers the headers needed for filters + payload.
   * Ignored when `format === "full"` (Gmail returns all headers anyway).
   */
  metadataHeaders?: readonly string[];
  /**
   * Gmail response format. Default `metadata` (pre-Commit-4 behavior).
   * `full` returns the full MIME tree under `payload.parts` — required by
   * the new_attachment trigger to enumerate attachment metadata.
   * Gmail 2.3 Commit 4.
   */
  format?: "metadata" | "full";
}

export interface GmailHeader {
  name: string;
  value: string;
}

/**
 * One MIME part in a `format=full` response.
 *
 * Recursive — multipart parts carry their own `parts` array. Gmail 2.3
 * Commit 4 — only inhabited when `format=full` is requested; metadata
 * responses omit `parts` and `body`.
 */
export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: readonly GmailHeader[];
  body?: {
    attachmentId?: string;
    size?: number;
    data?: string;
  };
  parts?: readonly GmailMessagePart[];
}

export interface UsersMessagesGetResult {
  id: string;
  threadId: string;
  labelIds: readonly string[];
  snippet: string;
  /** Milliseconds since epoch as a string (Gmail's wire format). */
  internalDate: string;
  sizeEstimate: number;
  payload: {
    mimeType: string;
    headers: readonly GmailHeader[];
    /**
     * Top-level MIME parts. Present in `format=full` responses only.
     * Undefined for `format=metadata` (pre-Commit-4 behavior preserved).
     */
    parts?: readonly GmailMessagePart[];
  };
}

const DEFAULT_METADATA_HEADERS = [
  "From",
  "To",
  "Cc",
  "Bcc",
  "Subject",
  "Date",
  "Delivered-To",
  "Message-ID",
] as const;

interface GmailErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

export async function usersMessagesGet(
  input: UsersMessagesGetInput,
): Promise<UsersMessagesGetResult> {
  const format = input.format ?? "metadata";
  const params = new URLSearchParams({ format });
  if (format === "metadata") {
    const headers = input.metadataHeaders ?? DEFAULT_METADATA_HEADERS;
    for (const h of headers) {
      params.append("metadataHeaders", h);
    }
  }

  const res = await fetch(
    `${gmailApiBase()}/gmail/v1/users/me/messages/${encodeURIComponent(
      input.messageId,
    )}?${params.toString()}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${input.accessToken}` },
    },
  );

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Gmail users.messages.get returned HTTP 401",
    );
  }

  if (!res.ok) {
    const text = await res.text();
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as GmailErrorPayload;
      if (parsed?.error?.message) detail = parsed.error.message;
      else if (parsed?.error?.status) detail = parsed.error.status;
    } catch {
      // not JSON
    }
    throw new Error(`Gmail messages.get failed: ${detail}`);
  }

  return (await res.json()) as UsersMessagesGetResult;
}
