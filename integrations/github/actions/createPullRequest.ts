import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pullsCreate } from "../../_shared/github/api/pulls";
import { resolveDefaultBranch } from "../../_shared/github/api/resolveDefaultBranch";
import { CreatePullRequestConfigSchema } from "./createPullRequest.schema";
import { parseRepository } from "./_parseRepository";

/**
 * `create_pull_request` GitHub action handler — Slice 14b Batch 1.
 *
 * Two-phase call:
 *   1. **PR-G6 default-branch auto-detect.** When the workflow
 *      author leaves `base` blank, fetch the repo's `default_branch`
 *      via `GET /repos/{owner}/{repo}` and use it as the PR's base.
 *      Fail-closed: if the lookup throws (404, empty string, etc.),
 *      `resolveDefaultBranch` throws a typed error which the
 *      handler's outer caller maps to a workflow failure with a
 *      precise message — never a silent `'main'` fallback that
 *      would produce a PR against the wrong branch.
 *   2. POST `/repos/{owner}/{repo}/pulls`.
 *
 * Both calls go through `refreshAndRetry`. Auxiliary calls (the
 * `reposGet` call inside `resolveDefaultBranch`) MUST also be
 * wrapped per CLAUDE.md "OAuth 401 Handling — Provider-Aware
 * Refresh+Retry" §"Auxiliary calls".
 *
 * Output shape (downstream variable refs):
 *   { pullRequestId, pullRequestNumber, title, body, state, draft,
 *     url, repository, head, base, createdAt }
 */
export const createPullRequest: ActionHandler = async (input) => {
  const config = CreatePullRequestConfigSchema.parse(input.config);
  const { owner, repo } = parseRepository(config.repository);

  const providerAccountId =
    input.triggerEvent.provider === "github"
      ? input.triggerEvent.providerAccountId
      : null;

  // PR-G6 auto-detect — wrap in refreshAndRetry per auxiliary-call
  // contract.
  const effectiveBase = await refreshAndRetry({
    accountId: input.accountId,
    provider: "github",
    providerAccountId,
    apiCall: (accessToken) =>
      resolveDefaultBranch({
        accessToken,
        owner,
        repo,
        supplied: config.base,
      }),
  });

  const pr = await refreshAndRetry({
    accountId: input.accountId,
    provider: "github",
    providerAccountId,
    apiCall: (accessToken) =>
      pullsCreate({
        accessToken,
        owner,
        repo,
        title: config.title,
        head: config.head,
        base: effectiveBase,
        body: config.body,
        draft: config.draft,
      }),
  });

  return {
    output: {
      pullRequestId: pr.id,
      pullRequestNumber: pr.number,
      title: pr.title,
      body: pr.body ?? null,
      state: pr.state,
      draft: pr.draft ?? false,
      url: pr.html_url,
      repository: config.repository,
      head: pr.head.ref,
      base: pr.base.ref,
      createdAt: pr.created_at ?? null,
    },
  };
};
