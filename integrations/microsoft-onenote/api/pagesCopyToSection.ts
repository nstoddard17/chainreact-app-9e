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
   * The URL of the long-running copy operation resource — poll it to track
   * completion + read the new page id.
   *
   * **Header source (verified live, SMOKE-WRITE-35):** OneNote's `copyToSection`
   * returns 202 with the operation URL in the **`Location`** header, NOT
   * `Operation-Location` (which Graph's docs name and which most other async Graph
   * ops use). The 202 body is the operation resource itself
   * (`{ id, status: "not started", … }`). We therefore read `Operation-Location`
   * first (spec/forward-compat) and fall back to `Location`. Previously we read only
   * `Operation-Location`, so this was always `null` and the copy was un-pollable.
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
    // Prefer the spec header (`Operation-Location`); fall back to `Location`, which is
    // what OneNote's copyToSection actually returns (verified live, SMOKE-WRITE-35).
    operationLocation:
      res.headers.get("operation-location") ?? res.headers.get("location"),
  };
}
