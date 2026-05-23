import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { docsApiBase } from "./_base";
import { surfaceDocsErrorDetail } from "./errors";

/**
 * Wrapper for Google Docs `documents.create`.
 *
 * Endpoint: POST {base}/v1/documents
 * Body:     application/json — `{ title }`
 * Returns:  the newly created `Document` resource. Body is empty after
 *           creation; content is inserted via a follow-up
 *           `documents.batchUpdate` call.
 *
 * Wire shape per https://developers.google.com/docs/api/reference/rest/v1/documents/create:
 *   - The CREATE endpoint accepts ONLY `title` in the request body.
 *     Setting `body.content` on create is silently ignored — Docs
 *     requires the two-step "create then batchUpdate" flow.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry contract).
 *   - generic `Error` on other 4xx/5xx with surfaced Google error message.
 */
export interface DocumentsCreateInput {
  accessToken: string;
  title: string;
}

export interface DocumentResource {
  documentId: string;
  title?: string;
  revisionId?: string;
  /**
   * Body is omitted by `documents.create` (Docs returns a Document
   * resource with empty body content). Surfaced as optional so callers
   * that re-`documents.get` to read body don't need a separate type.
   */
  body?: {
    content?: ReadonlyArray<Record<string, unknown>>;
  };
  [k: string]: unknown;
}

export async function documentsCreate(
  input: DocumentsCreateInput,
): Promise<DocumentResource> {
  const url = `${docsApiBase()}/v1/documents`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: input.title }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Docs documents.create returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Docs documents.create failed: ${surfaceDocsErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as DocumentResource;
}
