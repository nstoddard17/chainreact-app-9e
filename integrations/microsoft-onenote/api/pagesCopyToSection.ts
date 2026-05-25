import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Microsoft Graph
 * `POST /v1.0/me/onenote/pages/{pageId}/copyToSection` —
 * Slice 3.ONENOTE-2.
 *
 * Used by: `copy_page` action handler.
 *
 * **Asynchronous Graph operation.** Graph accepts the request and
 * returns HTTP 202 Accepted with an `Operation-Location` header
 * pointing at the long-running operation resource. The actual copy
 * completes server-side and is observable via polling that operation
 * endpoint. **ONENOTE-2 does NOT poll the operation** per ONENOTE-1
 * D-ON2 — the handler returns the operation location + a `success`
 * flag (meaning "Graph accepted," not "copy complete"). Polling can
 * ship as an ONENOTE-N polish slice if real consumers ask.
 *
 * Workflow authors who need the new pageId chain via the next
 * polling cycle's `new_note` trigger (ONENOTE-5).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (source page OR target section
 *     missing — Graph doesn't discriminate; the error message
 *     identifies which).
 *   - generic `Error` on other failures.
 */

export interface PagesCopyToSectionInput {
  accessToken: string;
  /** Source page to copy. */
  pageId: string;
  /** Target section id (Graph's request body field name is `id`). */
  targetSectionId: string;
}

export interface PagesCopyToSectionResult {
  /**
   * Graph's `Operation-Location` header value — the URL of the
   * long-running operation resource. Workflow authors who need to
   * track completion can poll this URL via the future operations
   * wrapper (deferred).
   */
  operationLocation: string | null;
}

export async function pagesCopyToSection(
  input: PagesCopyToSectionInput,
): Promise<PagesCopyToSectionResult> {
  const url = `${graphApiBase()}/v1.0/me/onenote/pages/${encodeURIComponent(input.pageId)}/copyToSection`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: input.targetSectionId }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/pages/{id}/copyToSection POST returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `onenote page ${input.pageId} or target section ${input.targetSectionId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/onenote/pages/{id}/copyToSection POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return {
    operationLocation: res.headers.get("operation-location"),
  };
}
