import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  gitRefGet,
  gitRefsCreate,
} from "../../_shared/github/api/repos";
import { resolveDefaultBranch } from "../../_shared/github/api/resolveDefaultBranch";
import { CreateBranchConfigSchema } from "./createBranch.schema";
import { parseRepository } from "./_parseRepository";

/**
 * `create_branch` GitHub action handler — Slice 14b Batch 1.
 *
 * Three-phase call:
 *   1. **PR-G6 default-branch auto-detect (V2 extension).** When the
 *      workflow author leaves `sourceBranch` blank, fetch the repo's
 *      `default_branch`. V1 hard-defaulted to literal `'main'` —
 *      fixed during port.
 *   2. GET the source branch's SHA via
 *      `/repos/{owner}/{repo}/git/ref/heads/{sourceBranch}`.
 *   3. POST the new branch ref via
 *      `/repos/{owner}/{repo}/git/refs` with `ref:
 *      refs/heads/<new>`, `sha: <source-sha>`.
 *
 * All three calls go through `refreshAndRetry` per CLAUDE.md
 * "Auxiliary calls" §. 401 on any call surfaces as
 * `IntegrationActionRequiredError(reason: "refresh_not_supported")`.
 *
 * Output shape (downstream variable refs):
 *   { ref, branchName, sha, repository, sourceBranch, url }
 */
export const createBranch: ActionHandler = async (input) => {
  const config = CreateBranchConfigSchema.parse(input.config);
  const { owner, repo } = parseRepository(config.repository);

  const accountId =
    input.triggerEvent.provider === "github"
      ? input.triggerEvent.accountId
      : null;

  // PR-G6 auto-detect for sourceBranch.
  const effectiveSource = await refreshAndRetry({
    userId: input.userId,
    provider: "github",
    accountId,
    apiCall: (accessToken) =>
      resolveDefaultBranch({
        accessToken,
        owner,
        repo,
        supplied: config.sourceBranch,
      }),
  });

  // Fetch source SHA.
  const sourceRef = await refreshAndRetry({
    userId: input.userId,
    provider: "github",
    accountId,
    apiCall: (accessToken) =>
      gitRefGet({
        accessToken,
        owner,
        repo,
        branch: effectiveSource,
      }),
  });

  // Create new ref.
  const newRef = await refreshAndRetry({
    userId: input.userId,
    provider: "github",
    accountId,
    apiCall: (accessToken) =>
      gitRefsCreate({
        accessToken,
        owner,
        repo,
        branchName: config.branchName,
        sha: sourceRef.object.sha,
      }),
  });

  return {
    output: {
      ref: newRef.ref,
      branchName: config.branchName,
      sha: newRef.object.sha,
      repository: config.repository,
      sourceBranch: effectiveSource,
      url: `https://github.com/${owner}/${repo}/tree/${config.branchName}`,
    },
  };
};
