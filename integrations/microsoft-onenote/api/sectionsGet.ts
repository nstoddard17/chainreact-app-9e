import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { OneNoteSection } from "./types";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/onenote/sections/{sectionId}` —
 * Slice 3.ONENOTE-2.
 *
 * Used by: `get_section_details` action handler.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (section missing).
 *   - generic `Error` on other failures.
 */

export interface SectionsGetInput {
  accessToken: string;
  sectionId: string;
}

export async function sectionsGet(
  input: SectionsGetInput,
): Promise<OneNoteSection> {
  const url = `${graphApiBase()}/v1.0/me/onenote/sections/${encodeURIComponent(input.sectionId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/sections/{id} GET returned HTTP 401",
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
      `Microsoft Graph me/onenote/sections/{id} GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as OneNoteSection;
}
