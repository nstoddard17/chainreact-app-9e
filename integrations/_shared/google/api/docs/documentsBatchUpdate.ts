import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { docsApiBase } from "./_base";
import { DocsNotFoundError, surfaceDocsErrorDetail } from "./errors";

/**
 * Wrapper for Google Docs `documents.batchUpdate`.
 *
 * Endpoint: POST {base}/v1/documents/{documentId}:batchUpdate
 * Body:     `{ requests: Request[] }` — Docs' request schema is a giant
 *           discriminated union (insertText / deleteContentRange /
 *           replaceAllText / updateTextStyle / insertTable / etc.).
 *
 * V2 v1 surface uses only:
 *   - `insertText`        — for end / beginning / after_text / before_text
 *                           insert modes.
 *   - `deleteContentRange` — paired with insertText for the `replace`
 *                           mode (delete the document body, then insert
 *                           new content at index 1).
 *
 * The wrapper accepts an opaque `requests` array — handlers build the
 * request payloads. The Docs API rejects malformed shapes server-side
 * with a 400 + structured error.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `DocsNotFoundError` on HTTP 404.
 *   - generic `Error` on other failures.
 */
export interface DocumentsBatchUpdateInput {
  accessToken: string;
  documentId: string;
  /**
   * Docs `Request[]`. Forwarded verbatim. Each entry is one of Docs'
   * documented request types (insertText, deleteContentRange,
   * replaceAllText, etc.) — we don't validate the shape client-side;
   * Docs rejects malformed shapes with a clear 400 error message.
   */
  requests: ReadonlyArray<Record<string, unknown>>;
}

/**
 * Docs returns the updated `Document` resource plus per-request `replies`
 * (mostly empty arrays for simple inserts; some request types — e.g.
 * `createParagraphBullets` — return structural replies). V2 ignores
 * `replies` today; the field is typed `unknown` so consumers don't take
 * a runtime dependency on its shape.
 */
export interface DocumentsBatchUpdateResponse {
  documentId: string;
  /** Echoes the document's writeControl block when present. */
  writeControl?: Record<string, unknown>;
  /** Per-request replies. V2 doesn't consume; surfaced for diagnostics. */
  replies?: ReadonlyArray<unknown>;
  [k: string]: unknown;
}

export async function documentsBatchUpdate(
  input: DocumentsBatchUpdateInput,
): Promise<DocumentsBatchUpdateResponse> {
  const url = `${docsApiBase()}/v1/documents/${encodeURIComponent(input.documentId)}:batchUpdate`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests: input.requests }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Docs documents.batchUpdate returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new DocsNotFoundError(
      `document ${input.documentId}`,
      surfaceDocsErrorDetail(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Docs documents.batchUpdate failed: ${surfaceDocsErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as DocumentsBatchUpdateResponse;
}
