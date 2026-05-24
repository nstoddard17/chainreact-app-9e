import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { OneNoteNotebook } from "./types";

/**
 * Wrapper for Microsoft Graph `POST /v1.0/me/onenote/notebooks` —
 * Slice 3.ONENOTE-2.
 *
 * Used by: `create_notebook` action handler.
 *
 * Graph requires `displayName` only. Notebook names must be unique
 * within the user's OneNote — Graph returns 409 conflict on
 * duplicates, surfaced as the standardized error message.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures.
 */

export interface NotebooksCreateInput {
  accessToken: string;
  displayName: string;
}

export async function notebooksCreate(
  input: NotebooksCreateInput,
): Promise<OneNoteNotebook> {
  const url = `${graphApiBase()}/v1.0/me/onenote/notebooks`;
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
      "Microsoft Graph me/onenote/notebooks POST returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/onenote/notebooks POST failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as OneNoteNotebook;
}
