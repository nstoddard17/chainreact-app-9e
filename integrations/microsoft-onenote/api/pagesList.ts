import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { OneNotePage } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/onenote/sections/{sectionId}/pages` —
 * Slice 3.ONENOTE-2.
 *
 * Used by: `list_pages` action handler. Also consumable by the future
 * `microsoft-onenote:pages` options resolver (ONENOTE-3 — dep:
 * sectionId).
 *
 * Slice ONENOTE-2 surface — structured filters only:
 *   - `top` ($top page size; Graph caps at 100 for OneNote pages).
 *   - `orderBy` ($orderby).
 *
 * **V1 `filter` field (raw OData query) intentionally NOT exposed.**
 * Per ONENOTE-1 §4.1 D-defer: OData strings are footgun-prone without
 * a validation layer, and the V2 v1 surface has no schema-level
 * validation for them. A future structured filter set
 * (date-range / title-contains) ships when real consumers ask.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (section missing).
 *   - generic `Error` on other failures.
 */

export interface PagesListInput {
  accessToken: string;
  sectionId: string;
  top?: number;
  orderBy?: string;
}

export interface PagesListResult {
  pages: OneNotePage[];
  nextLink: string | null;
}

export async function pagesList(
  input: PagesListInput,
): Promise<PagesListResult> {
  const url = new URL(
    `${graphApiBase()}/v1.0/me/onenote/sections/${encodeURIComponent(input.sectionId)}/pages`,
  );
  if (input.top !== undefined) url.searchParams.set("$top", String(input.top));
  if (input.orderBy) url.searchParams.set("$orderby", input.orderBy);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/sections/{id}/pages GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `onenote pages for section ${input.sectionId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/onenote/sections/{id}/pages GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as {
    value?: OneNotePage[];
    "@odata.nextLink"?: string;
  };
  return {
    pages: body.value ?? [],
    nextLink: body["@odata.nextLink"] ?? null,
  };
}
