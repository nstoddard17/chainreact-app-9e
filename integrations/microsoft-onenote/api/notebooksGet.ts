import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { OneNoteNotebook } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/onenote/notebooks/{notebookId}` —
 * Slice 3.ONENOTE-2.
 *
 * Used by: `get_notebook_details` action handler.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (notebook missing).
 *   - generic `Error` on other failures.
 */

export interface NotebooksGetInput {
  accessToken: string;
  notebookId: string;
}

export async function notebooksGet(
  input: NotebooksGetInput,
): Promise<OneNoteNotebook> {
  const url = `${graphApiBase()}/v1.0/me/onenote/notebooks/${encodeURIComponent(input.notebookId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/notebooks/{id} GET returned HTTP 401",
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
      `Microsoft Graph me/onenote/notebooks/{id} GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as OneNoteNotebook;
}
