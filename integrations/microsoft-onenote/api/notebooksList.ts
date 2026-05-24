import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { OneNoteNotebook } from "./types";

/**
 * Wrapper for Microsoft Graph `GET /v1.0/me/onenote/notebooks` —
 * Slice 3.ONENOTE-2.
 *
 * Used by: `list_notebooks` action handler. Also consumable by the
 * future `microsoft-onenote:notebooks` options resolver (ONENOTE-3).
 *
 * Slice ONENOTE-2 surface:
 *   - Optional `orderBy` (passes through as `$orderby`). Valid
 *     V1-preserved values: `displayName asc/desc`,
 *     `lastModifiedDateTime asc/desc`, `createdDateTime asc/desc`.
 *   - Optional `top` (passes through as `$top`).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry contract).
 *   - generic `Error` on other failures with Graph error message
 *     surfaced via `surfaceGraphError` (no token leakage; no raw body).
 */

export interface NotebooksListInput {
  accessToken: string;
  orderBy?: string;
  top?: number;
}

export interface NotebooksListResult {
  notebooks: OneNoteNotebook[];
  nextLink: string | null;
}

export async function notebooksList(
  input: NotebooksListInput,
): Promise<NotebooksListResult> {
  const url = new URL(`${graphApiBase()}/v1.0/me/onenote/notebooks`);
  if (input.orderBy) url.searchParams.set("$orderby", input.orderBy);
  if (input.top !== undefined) url.searchParams.set("$top", String(input.top));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/notebooks GET returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/onenote/notebooks GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as {
    value?: OneNoteNotebook[];
    "@odata.nextLink"?: string;
  };
  return {
    notebooks: body.value ?? [],
    nextLink: body["@odata.nextLink"] ?? null,
  };
}
