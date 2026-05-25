import { reposGet } from "./repos";

/**
 * Shared PR-G6 default-branch resolver.
 *
 * Slice 14b Commit 3. Used by both `create_pull_request` (V1 had this)
 * and `create_branch` (V1 hard-defaulted to literal `'main'` — V2 fix
 * extends the same fail-closed auto-detect to source-branch
 * resolution).
 *
 * Behavior:
 *   - If the caller supplied a non-empty branch string, return it as-is.
 *     The auto-detect path is ONLY taken when the workflow author left
 *     the field blank.
 *   - Otherwise call `reposGet` to fetch the repo's `default_branch`.
 *   - If `reposGet` 404s, throws `RepoNotFoundForDefaultBranchError`.
 *     If `default_branch` comes back empty / non-string, throws
 *     `EmptyDefaultBranchError`. **Never silently falls back to
 *     `'main'`** — that's the V1 bug being fixed: many repos use
 *     `master`, `develop`, `trunk` etc. as their default.
 *   - All thrown errors are caught at the handler boundary and
 *     converted to a `success: false` result with `category: 'provider'`
 *     so the workflow surfaces a useful message rather than producing
 *     a PR / branch against the wrong base.
 *
 * Reference: V1
 * [`github.ts:266-302`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L266)
 * for `create_pull_request`'s implementation. V2 extracts the helper
 * so `create_branch` (V1 line 465) can reuse it without duplicating
 * the auto-detect call.
 */

export class RepoNotFoundForDefaultBranchError extends Error {
  readonly owner: string;
  readonly repo: string;
  readonly cause: unknown;
  constructor(owner: string, repo: string, cause: unknown) {
    super(
      `Could not auto-detect default branch for ${owner}/${repo}: repository not found or inaccessible. Set the branch explicitly in the workflow node.`,
      { cause: cause instanceof Error ? cause : undefined },
    );
    this.name = "RepoNotFoundForDefaultBranchError";
    this.owner = owner;
    this.repo = repo;
    this.cause = cause;
  }
}

export class EmptyDefaultBranchError extends Error {
  readonly owner: string;
  readonly repo: string;
  constructor(owner: string, repo: string) {
    super(
      `GitHub returned no default_branch for ${owner}/${repo}. Set the branch explicitly in the workflow node.`,
    );
    this.name = "EmptyDefaultBranchError";
    this.owner = owner;
    this.repo = repo;
  }
}

export interface ResolveDefaultBranchInput {
  accessToken: string;
  owner: string;
  repo: string;
  /**
   * The user-supplied branch value from the workflow node config.
   * `null` / `undefined` / empty string triggers the auto-detect
   * path.
   */
  supplied: string | null | undefined;
}

export async function resolveDefaultBranch(
  input: ResolveDefaultBranchInput,
): Promise<string> {
  if (typeof input.supplied === "string" && input.supplied.length > 0) {
    return input.supplied;
  }

  let repoData;
  try {
    repoData = await reposGet({
      accessToken: input.accessToken,
      owner: input.owner,
      repo: input.repo,
    });
  } catch (err) {
    throw new RepoNotFoundForDefaultBranchError(input.owner, input.repo, err);
  }

  if (
    typeof repoData.default_branch !== "string" ||
    repoData.default_branch.length === 0
  ) {
    throw new EmptyDefaultBranchError(input.owner, input.repo);
  }
  return repoData.default_branch;
}
