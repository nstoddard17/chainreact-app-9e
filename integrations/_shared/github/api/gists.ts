import { githubRequest } from "./_request";

/**
 * GitHub REST `/gists` resource wrappers.
 *
 * Slice 14b Commit 3. Per-resource thin wrapper layer.
 *
 * Resources covered:
 *   - `gistsCreate` — POST `/gists` (Slice 14b `create_gist`).
 *     Single-file gists for Batch 1; multi-file support is
 *     mechanically straightforward but deferred to a future slice
 *     (V1 only ships single-file too).
 *
 * Requires `gist` OAuth scope (declared in
 * `integrations/github/manifest.ts:scopes.required`).
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface GitHubGistFile {
  filename?: string;
  type?: string;
  language?: string | null;
  raw_url?: string;
  size?: number;
  content?: string;
}

export interface GitHubGist {
  id: string;
  description?: string | null;
  public: boolean;
  html_url: string;
  url?: string;
  files: Readonly<Record<string, GitHubGistFile>>;
  created_at?: string;
  updated_at?: string;
}

// ─── gistsCreate ────────────────────────────────────────────────────────────

export interface GistsCreateInput {
  accessToken: string;
  /** File name for the gist's single file (e.g. `"snippet.ts"`). */
  filename: string;
  /** File content. */
  content: string;
  description?: string;
  /**
   * Public vs secret gist. Defaults to `false` (secret) at the
   * handler layer if the workflow author leaves the field unset —
   * V2 surfaces this as a required schema choice for explicit
   * consent (gists are world-readable when public).
   */
  public: boolean;
}

export async function gistsCreate(
  input: GistsCreateInput,
): Promise<GitHubGist> {
  const body: Record<string, unknown> = {
    public: input.public,
    files: {
      [input.filename]: { content: input.content },
    },
  };
  if (input.description !== undefined) body.description = input.description;

  return githubRequest<GitHubGist>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/gists",
    body,
    resourceForNotFound: "gist (create)",
  });
}
