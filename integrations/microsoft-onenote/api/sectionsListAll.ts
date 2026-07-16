import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { OneNoteSection } from "./types";

/**
 * Wrapper for Microsoft Graph `GET /v1.0/me/onenote/sections` —
 * RESOLVERS-1.
 *
 * Lists sections ACROSS ALL of the user's notebooks (unlike
 * `sectionsList.ts`, which lists one notebook's sections). Backs the
 * `microsoft-onenote:target_sections` resolver — the copy_page target
 * picker needs a destination section from ANY notebook without adding a
 * second notebook cascade (the copy_page runtime schema is `.strict()`
 * and field names are already claimed by the source-side cascade).
 * Docs: https://learn.microsoft.com/en-us/graph/api/onenote-list-sections
 * Scope: covered by the manifest's existing `Notes.ReadWrite`.
 *
 * `$expand=parentNotebook($select=id,displayName)` pins the owning
 * notebook explicitly (OneNote returns parentNotebook by default, but
 * relying on defaults is drift-prone) so the resolver can label items
 * "Notebook › Section". Graph paginates via `@odata.nextLink`; this
 * helper returns one page + the nextLink. The token NEVER appears in a
 * thrown error (only method + resource).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404.
 *   - generic `Error` on other failures.
 */

export interface SectionsListAllInput {
  accessToken: string;
  top?: number;
}

export interface SectionsListAllResult {
  sections: OneNoteSection[];
  nextLink: string | null;
}

export async function sectionsListAll(
  input: SectionsListAllInput,
): Promise<SectionsListAllResult> {
  const url = new URL(`${graphApiBase()}/v1.0/me/onenote/sections`);
  url.searchParams.set("$expand", "parentNotebook($select=id,displayName)");
  if (input.top !== undefined) url.searchParams.set("$top", String(input.top));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/onenote/sections GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError("onenote sections", surfaceGraphError(text, 404));
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/onenote/sections GET failed: ${surfaceGraphError(text, res.status)}`,
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
