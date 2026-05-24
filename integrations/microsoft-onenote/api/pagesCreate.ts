import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { OneNotePage } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `POST /v1.0/me/onenote/sections/{sectionId}/pages` —
 * Slice 3.ONENOTE-2.
 *
 * Used by: `create_page` action handler.
 *
 * Body is HTML or XHTML (NOT JSON). The Content-Type header drives
 * Graph's parser:
 *   - `text/html`               — Graph parses as HTML5.
 *   - `application/xhtml+xml`   — Graph parses as XHTML (stricter).
 *
 * V2-native default (ONENOTE-1 D-ON1): `text/html`. The handler
 * constructs the body from `title` + `content` per the V1-derived
 * template; this wrapper is content-agnostic and just ships whatever
 * the handler hands over.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (section missing).
 *   - generic `Error` on other failures.
 */

export interface PagesCreateInput {
  accessToken: string;
  sectionId: string;
  /** Full HTML or XHTML document. Handler builds the scaffolding. */
  htmlBody: string;
  /** "text/html" (default) or "application/xhtml+xml". */
  contentType: "text/html" | "application/xhtml+xml";
}

export async function pagesCreate(
  input: PagesCreateInput,
): Promise<OneNotePage> {
  const url = `${graphApiBase()}/v1.0/me/onenote/sections/${encodeURIComponent(input.sectionId)}/pages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": input.contentType,
    },
    body: input.htmlBody,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/sections/{id}/pages POST returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `onenote section ${input.sectionId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/onenote/sections/{id}/pages POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as OneNotePage;
}
