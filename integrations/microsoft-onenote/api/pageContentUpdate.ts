import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { OneNotePagePatchAction } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `PATCH /v1.0/me/onenote/pages/{pageId}/content` —
 * Slice 3.ONENOTE-2.
 *
 * Used by: `update_page` action handler.
 *
 * Body is a JSON array of action operations (see
 * `OneNotePagePatchAction`). Each entry targets either the special
 * token `"body"` or a CSS selector / `data-id` value, with an
 * `action` of `append`, `prepend`, `replace`, or `insert` (+ optional
 * `position` for insert-mode). Content is HTML.
 *
 * Graph returns HTTP 204 No Content on success (no response body).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (page missing).
 *   - generic `Error` on other failures (400 surfaced when the patch
 *     body is malformed or the target element doesn't exist).
 */

export interface PageContentUpdateInput {
  accessToken: string;
  pageId: string;
  operations: ReadonlyArray<OneNotePagePatchAction>;
}

export async function pageContentUpdate(
  input: PageContentUpdateInput,
): Promise<void> {
  const url = `${graphApiBase()}/v1.0/me/onenote/pages/${encodeURIComponent(input.pageId)}/content`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.operations),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/pages/{id}/content PATCH returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `onenote page ${input.pageId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/onenote/pages/{id}/content PATCH failed: ${surfaceGraphError(text, res.status)}`,
    );
  }
  // 204 No Content — nothing to return.
}
