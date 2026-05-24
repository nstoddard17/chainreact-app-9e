import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { OneNotePage } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/onenote/pages/{pageId}` — Slice 3.ONENOTE-2.
 *
 * Returns the page METADATA resource (title / dates / links /
 * parentSection / parentNotebook). For the page BODY HTML, use
 * `pageContentGet`.
 *
 * Used by: `get_page_content` action (paired with `pageContentGet`),
 * `update_page` (to fetch refreshed metadata after PATCH).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (page missing).
 *   - generic `Error` on other failures.
 */

export interface PagesGetInput {
  accessToken: string;
  pageId: string;
}

export async function pagesGet(input: PagesGetInput): Promise<OneNotePage> {
  const url = `${graphApiBase()}/v1.0/me/onenote/pages/${encodeURIComponent(input.pageId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/pages/{id} GET returned HTTP 401",
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
      `Microsoft Graph me/onenote/pages/{id} GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as OneNotePage;
}
