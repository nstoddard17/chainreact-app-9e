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
 *   - `reposBranchesList` — GET `/repos/{owner}/{repo}/branches`
 *     (RESOLVERS-1 — `github:branches` options resolver; read-only,
 *     one bounded page).
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

// ─── userReposList ──────────────────────────────────────────────────────────

/** One page is 100 (GitHub's max per_page). */
export const REPOS_PAGE_SIZE = 100;
/** Hard cap on pages so a user with thousands of repos can't make this unbounded. */
export const REPOS_MAX_PAGES = 5;
/** Absolute ceiling on repos listed (500). Beyond this, callers fall back to manual entry. */
export const REPOS_MAX = REPOS_PAGE_SIZE * REPOS_MAX_PAGES;

/** Normalized repo option — only the fields a picker needs; no raw payload. */
export interface UserRepoOption {
  /** `owner/repo` — the value a widget stores + the analytics adapter validates. */
  fullName: string;
  private: boolean;
}

export interface UserReposListResult {
  repos: UserRepoOption[];
  /** True when the user has more repos than the page cap returned. */
  truncated: boolean;
}

export interface UserReposListInput {
  accessToken: string;
}

/**
 * List the authenticated user's accessible repositories, normalized to
 * `{ fullName, private }`. READ-ONLY (`GET /user/repos`), sorted by most-recently
 * updated, across owned + collaborator + org-member affiliations — using only the
 * already-granted `repo` scope (no new scope). BOUNDED: at most
 * {@link REPOS_MAX_PAGES} pages of {@link REPOS_PAGE_SIZE}; if the user has more,
 * `truncated: true` and callers keep the manual `owner/repo` entry path. Raw repo
 * payloads / tokens never escape — only `fullName` + a private flag.
 */
export async function userReposList(
  input: UserReposListInput,
): Promise<UserReposListResult> {
  const repos: UserRepoOption[] = [];
  let truncated = false;

  for (let page = 1; page <= REPOS_MAX_PAGES; page++) {
    const query = new URLSearchParams({
      per_page: String(REPOS_PAGE_SIZE),
      page: String(page),
      sort: "updated",
      affiliation: "owner,collaborator,organization_member",
    });
    const batch = await githubRequest<GitHubRepository[]>({
      accessToken: input.accessToken,
      method: "GET",
      path: "/user/repos",
      query,
      resourceForNotFound: "your GitHub repositories",
    });

    for (const r of batch) {
      if (r && typeof r.full_name === "string" && r.full_name.length > 0) {
        repos.push({ fullName: r.full_name, private: Boolean(r.private) });
      }
    }

    if (batch.length < REPOS_PAGE_SIZE) {
      return { repos, truncated }; // last page reached
    }
    if (page === REPOS_MAX_PAGES) {
      truncated = true; // a full page at the cap → more repos exist
    }
  }

  return { repos, truncated };
}

// ─── reposBranchesList ──────────────────────────────────────────────────────

/** One page is 100 (GitHub's max `per_page` for the branches endpoint). */
export const BRANCHES_PAGE_SIZE = 100;

/** Normalized branch option — only the fields a picker needs; no raw payload. */
export interface RepoBranchOption {
  /** Branch name (e.g. `main`, `feature/widget`) — the value handlers store. */
  name: string;
  protected: boolean;
}

/** Wire shape of one GET `/repos/{owner}/{repo}/branches` entry. */
interface GitHubBranchWire {
  name?: string;
  protected?: boolean;
}

export interface ReposBranchesListInput {
  accessToken: string;
  owner: string;
  repo: string;
}

export interface ReposBranchesListResult {
  branches: RepoBranchOption[];
  /** True when a full page came back — more branches may exist. */
  truncated: boolean;
}

/**
 * List a repository's branches, normalized to `{ name, protected }`.
 * READ-ONLY (`GET /repos/{owner}/{repo}/branches?per_page=100`) using the
 * already-granted `repo` scope. BOUNDED: one page of
 * {@link BRANCHES_PAGE_SIZE}; callers keep a manual branch-name entry path
 * for repos with more branches. Raw branch payloads (commit SHAs, URLs)
 * never escape — only `name` + a protected flag.
 *
 * Docs: https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28#list-branches
 */
export async function reposBranchesList(
  input: ReposBranchesListInput,
): Promise<ReposBranchesListResult> {
  const query = new URLSearchParams({
    per_page: String(BRANCHES_PAGE_SIZE),
  });
  const batch = await githubRequest<GitHubBranchWire[]>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/branches`,
    query,
    resourceForNotFound: `repository ${input.owner}/${input.repo}`,
  });

  const branches: RepoBranchOption[] = [];
  for (const b of batch) {
    if (b && typeof b.name === "string" && b.name.length > 0) {
      branches.push({ name: b.name, protected: Boolean(b.protected) });
    }
  }
  return { branches, truncated: batch.length === BRANCHES_PAGE_SIZE };
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
