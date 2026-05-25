import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { docsApiBase } from "./_base";
import { DocsNotFoundError, surfaceDocsErrorDetail } from "./errors";
import type { DocumentResource } from "./documentsCreate";

/**
 * Wrapper for Google Docs `documents.get`.
 *
 * Endpoint: GET {base}/v1/documents/{documentId}
 * Returns:  full `Document` resource including `body.content[]` (the
 *           StructuralElement tree — paragraphs, tables, sections,
 *           inline objects).
 *
 * V2's `get_document` action handler walks `body.content[]` →
 * `paragraph.elements[]` → `textRun.content` to flatten the document
 * into a single string. That extraction lives in the action handler
 * (it's product-shape work, not a wrapper concern); this wrapper
 * surfaces the raw Document.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `DocsNotFoundError` on HTTP 404.
 *   - generic `Error` on other failures.
 */
export interface DocumentsGetInput {
  accessToken: string;
  documentId: string;
}

export async function documentsGet(
  input: DocumentsGetInput,
): Promise<DocumentResource> {
  const url = `${docsApiBase()}/v1/documents/${encodeURIComponent(input.documentId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Docs documents.get returned HTTP 401",
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
      `Google Docs documents.get failed: ${surfaceDocsErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as DocumentResource;
}
