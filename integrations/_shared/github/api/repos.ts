import { githubRequest } from "./_request";

/**
 * GitHub REST `/repos` + `/user/repos` resource wrappers.
 *
 * Slice 14b Commit 3. Per-resource thin wrapper layer — body shape
 * per endpoint lives here; HTTP semantics + auth + error mapping live
 * in `_request.ts`. Output types match GitHub's REST response shape
 * (snake_case wire format); handlers map the wire shape to typed
 * outputs at their boundary.
 *
 * Resources covered:
 *   - `reposGet` — GET `/repos/{owner}/{repo}` (PR-G6 default-branch
 *     auto-detect lookup; reused by `create_pull_request` and
 *     `create_branch`).
 *   - `userReposCreate` — POST `/user/repos` (Slice 14b
 *     `create_repository`). Creates an authenticated-user-owned
 *     repository.
 *   - `gitRefGet` — GET `/repos/{owner}/{repo}/git/ref/heads/{branch}`
 *     (`create_branch` source-branch SHA lookup).
 *   - `gitRefsCreate` — POST `/repos/{owner}/{repo}/git/refs`
 *     (`create_branch` new-ref creation).
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description?: string | null;
  private: boolean;
  html_url: string;
  clone_url?: string;
  ssh_url?: string;
  default_branch: string;
  homepage?: string | null;
}

export interface GitHubGitRef {
  ref: string;
  url: string;
  object: {
    sha: string;
    type?: string;
    url?: string;
  };
}

// ─── reposGet ───────────────────────────────────────────────────────────────

export interface ReposGetInput {
  accessToken: string;
  owner: string;
  repo: string;
}

export async function reposGet(
  input: ReposGetInput,
): Promise<GitHubRepository> {
  return githubRequest<GitHubRepository>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`,
    resourceForNotFound: `repository ${input.owner}/${input.repo}`,
  });
}

// ─── userReposCreate ────────────────────────────────────────────────────────

export interface UserReposCreateInput {
  accessToken: string;
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
  gitignore_template?: string;
  license_template?: string;
  homepage?: string;
}

export async function userReposCreate(
  input: UserReposCreateInput,
): Promise<GitHubRepository> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.description !== undefined) body.description = input.description;
  if (input.private !== undefined) body.private = input.private;
  if (input.auto_init !== undefined) body.auto_init = input.auto_init;
  if (input.gitignore_template !== undefined) {
    body.gitignore_template = input.gitignore_template;
  }
  if (input.license_template !== undefined) {
    body.license_template = input.license_template;
  }
  if (input.homepage !== undefined) body.homepage = input.homepage;

  return githubRequest<GitHubRepository>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/user/repos",
    body,
    resourceForNotFound: `repository ${input.name} (create)`,
  });
}

// ─── gitRefGet ──────────────────────────────────────────────────────────────

export interface GitRefGetInput {
  accessToken: string;
  owner: string;
  repo: string;
  /**
   * Branch name (NOT the full `refs/heads/...` ref). The wrapper
   * builds the `git/ref/heads/<branch>` path.
   */
  branch: string;
}

export async function gitRefGet(input: GitRefGetInput): Promise<GitHubGitRef> {
  return githubRequest<GitHubGitRef>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/git/ref/heads/${encodeURIComponent(input.branch)}`,
    resourceForNotFound: `branch ${input.branch} on ${input.owner}/${input.repo}`,
  });
}

// ─── gitRefsCreate ──────────────────────────────────────────────────────────

export interface GitRefsCreateInput {
  accessToken: string;
  owner: string;
  repo: string;
  /**
   * The new branch name (NOT the full `refs/heads/...` ref). The
   * wrapper prepends `refs/heads/` to satisfy GitHub's API contract.
   */
  branchName: string;
  /** SHA of the source commit/branch the new ref will point at. */
  sha: string;
}

export async function gitRefsCreate(
  input: GitRefsCreateInput,
): Promise<GitHubGitRef> {
  return githubRequest<GitHubGitRef>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/git/refs`,
    body: {
      ref: `refs/heads/${input.branchName}`,
      sha: input.sha,
    },
    resourceForNotFound: `branch ${input.branchName} (create) on ${input.owner}/${input.repo}`,
  });
}
