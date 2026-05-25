import { z } from "zod";

/**
 * `create_pull_request` action schema.
 *
 * Slice 14b Batch 1. V1 reference:
 * [`github.ts:221-360`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L221).
 *
 * Required: `repository`, `title`, `head`. Optional: `base`, `body`,
 * `draft`.
 *
 * **PR-G6 default-branch auto-detect.** `base` is optional. When
 * absent / empty, the handler calls `resolveDefaultBranch` to fetch
 * the repo's `default_branch`. **NO silent fallback to `'main'`** —
 * many repos use `master`, `develop`, `trunk`. The auto-detect call
 * fails closed via `RepoNotFoundForDefaultBranchError` /
 * `EmptyDefaultBranchError`, which the handler's catch surfaces as
 * a `provider`-category error.
 *
 * `head` may be a simple branch name (`feature/x`) or
 * cross-repo notation (`fork-owner:branch`) — schema accepts both
 * shapes; the GitHub API resolves them.
 */
export const CreatePullRequestConfigSchema = z
  .object({
    repository: z
      .string()
      .regex(
        /^[^/\s]+\/[^/\s]+$/,
        "repository must be in 'owner/repo' format (e.g. 'octocat/hello-world')",
      ),
    title: z.string().min(1),
    head: z.string().min(1),
    /**
     * When omitted/empty, the handler auto-detects the repo's
     * default branch via `reposGet`. PR-G6 fail-closed contract.
     */
    base: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    draft: z.boolean().optional(),
  })
  .strict();

export type CreatePullRequestConfig = z.infer<typeof CreatePullRequestConfigSchema>;
