import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { OneNoteSection } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `POST /v1.0/me/onenote/notebooks/{notebookId}/sections` —
 * Slice 3.ONENOTE-2.
 *
 * Used by: `create_section` action handler.
 *
 * Graph requires `displayName`. Section names must be unique within
 * the parent notebook — Graph returns 409 conflict on duplicates,
 * surfaced as the standardized error message.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (parent notebook missing).
 *   - generic `Error` on other failures.
 */

export interface SectionsCreateInput {
  accessToken: string;
  notebookId: string;
  displayName: string;
}

export async function sectionsCreate(
  input: SectionsCreateInput,
): Promise<OneNoteSection> {
  const url = `${graphApiBase()}/v1.0/me/onenote/notebooks/${encodeURIComponent(input.notebookId)}/sections`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ displayName: input.displayName }),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/notebooks/{id}/sections POST returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `onenote notebook ${input.notebookId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/onenote/notebooks/{id}/sections POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as OneNoteSection;
}
