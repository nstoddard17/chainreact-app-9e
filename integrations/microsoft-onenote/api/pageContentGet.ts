import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/onenote/pages/{pageId}/content` — Slice 3.ONENOTE-2.
 *
 * Returns the page's HTML body as a string. Distinct from `pagesGet`
 * (which returns the metadata resource).
 *
 * Used by: `get_page_content` action handler.
 *
 * V1-preserved query params:
 *   - `includeIDs` (default false) — when true, Graph appends
 *     `data-id` attributes to HTML elements. Required when chaining
 *     into `update_page` with `updateMode: "insert"` — the
 *     selector / data-id MUST exist on the element being targeted.
 *   - `preGenerated` (default true) — Graph performance hint;
 *     `true` returns the cached HTML (fastest); `false` forces a
 *     fresh render.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (page missing).
 *   - generic `Error` on other failures.
 */

export interface PageContentGetInput {
  accessToken: string;
  pageId: string;
  includeIDs?: boolean;
  preGenerated?: boolean;
}

export interface PageContentGetResult {
  /** Raw HTML body string. */
  html: string;
}

export async function pageContentGet(
  input: PageContentGetInput,
): Promise<PageContentGetResult> {
  const url = new URL(
    `${graphApiBase()}/v1.0/me/onenote/pages/${encodeURIComponent(input.pageId)}/content`,
  );
  if (input.includeIDs === true) url.searchParams.set("includeIDs", "true");
  if (input.preGenerated === false) {
    url.searchParams.set("preAuthenticated", "false");
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/pages/{id}/content GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `onenote page content ${input.pageId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/onenote/pages/{id}/content GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return { html: await res.text() };
}
