import { githubRequest } from "./_request";

/**
 * GitHub REST `/repos/{owner}/{repo}/pulls` resource wrappers.
 *
 * Slice 14b Commit 3. Per-resource thin wrapper layer.
 *
 * Resources covered:
 *   - `pullsCreate` — POST `/repos/{owner}/{repo}/pulls` (Slice 14b
 *     `create_pull_request`). The PR-G6 default-branch auto-detect
 *     happens at the handler boundary, NOT inside this wrapper —
 *     this wrapper just sends what it's given. The handler resolves
 *     `base` to a concrete value before calling.
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface GitHubPullRequestRef {
  ref: string;
  sha: string;
  label?: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body?: string | null;
  state: string;
  draft?: boolean;
  html_url: string;
  head: GitHubPullRequestRef;
  base: GitHubPullRequestRef;
  created_at?: string;
  updated_at?: string;
  merged?: boolean;
  mergeable?: boolean | null;
}

// ─── pullsCreate ────────────────────────────────────────────────────────────

export interface PullsCreateInput {
  accessToken: string;
  owner: string;
  repo: string;
  title: string;
  /** Branch where the changes are implemented (e.g. `feature/x`). */
  head: string;
  /**
   * Branch the changes will merge into. Resolved by the handler
   * (PR-G6 default-branch auto-detect when the workflow author left
   * it blank); the wrapper assumes a concrete value.
   */
  base: string;
  body?: string;
  draft?: boolean;
}

export async function pullsCreate(
  input: PullsCreateInput,
): Promise<GitHubPullRequest> {
  const body: Record<string, unknown> = {
    title: input.title,
    head: input.head,
    base: input.base,
  };
  if (input.body !== undefined) body.body = input.body;
  if (input.draft !== undefined) body.draft = input.draft;

  return githubRequest<GitHubPullRequest>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls`,
    body,
    resourceForNotFound: `pull request (create) on ${input.owner}/${input.repo}`,
  });
}
