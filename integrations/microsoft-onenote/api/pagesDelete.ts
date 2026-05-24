import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Microsoft Graph
 * `DELETE /v1.0/me/onenote/pages/{pageId}` — Slice 3.ONENOTE-2.
 *
 * Used by: `delete_page` action handler.
 *
 * **Irreversible.** OneNote retains no per-page programmatic undo
 * (notebook-level recycle bin exists but workflow authors can't
 * restore via API). Risk classification + destructive-trio gate
 * land in ONENOTE-4.
 *
 * Graph returns HTTP 204 No Content on success.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (already deleted / never existed).
 *   - generic `Error` on other failures.
 */

export interface PagesDeleteInput {
  accessToken: string;
  pageId: string;
}

export async function pagesDelete(input: PagesDeleteInput): Promise<void> {
  const url = `${graphApiBase()}/v1.0/me/onenote/pages/${encodeURIComponent(input.pageId)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/pages/{id} DELETE returned HTTP 401",
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
      `Microsoft Graph me/onenote/pages/{id} DELETE failed: ${surfaceGraphError(text, res.status)}`,
    );
  }
  // 204 No Content.
}
