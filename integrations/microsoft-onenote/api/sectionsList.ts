import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { OneNoteSection } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/onenote/notebooks/{notebookId}/sections` —
 * Slice 3.ONENOTE-2.
 *
 * Used by: `list_sections` action handler. Also consumable by the
 * future `microsoft-onenote:sections` options resolver (ONENOTE-3 —
 * dep: notebookId).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (notebook missing or access lost).
 *   - generic `Error` on other failures.
 */

export interface SectionsListInput {
  accessToken: string;
  notebookId: string;
  orderBy?: string;
  top?: number;
}

export interface SectionsListResult {
  sections: OneNoteSection[];
  nextLink: string | null;
}

export async function sectionsList(
  input: SectionsListInput,
): Promise<SectionsListResult> {
  const url = new URL(
    `${graphApiBase()}/v1.0/me/onenote/notebooks/${encodeURIComponent(input.notebookId)}/sections`,
  );
  if (input.orderBy) url.searchParams.set("$orderby", input.orderBy);
  if (input.top !== undefined) url.searchParams.set("$top", String(input.top));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/notebooks/{id}/sections GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `onenote sections for notebook ${input.notebookId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/onenote/notebooks/{id}/sections GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as {
    value?: OneNoteSection[];
    "@odata.nextLink"?: string;
  };
  return {
    sections: body.value ?? [],
    nextLink: body["@odata.nextLink"] ?? null,
  };
}
