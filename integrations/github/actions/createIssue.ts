import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { issuesCreate } from "../../_shared/github/api/issues";
import { CreateIssueConfigSchema } from "./createIssue.schema";
import { parseRepository } from "./_parseRepository";

/**
 * `create_issue` GitHub action handler — Slice 14b Batch 1.
 *
 * POSTs `/repos/{owner}/{repo}/issues` with the user's access token.
 * Wraps the principal call in `refreshAndRetry` so 401s surface
 * through the standard `IntegrationActionRequiredError(reason:
 * "refresh_not_supported")` path (GitHub is non-refreshable per
 * Slice 14b Commit 2).
 *
 * Output shape (downstream variable refs):
 *   { issueId, issueNumber, title, body, state, url, repository,
 *     labels, assignees }
 *
 *   Stable for downstream `add_comment` / branch-creation chains —
 *   `{{nodeId.issueNumber}}` is the typical reference.
 */
export const createIssue: ActionHandler = async (input) => {
  const config = CreateIssueConfigSchema.parse(input.config);
  const { owner, repo } = parseRepository(config.repository);

  const accountId =
    input.triggerEvent.provider === "github"
      ? input.triggerEvent.accountId
      : null;

  const issue = await refreshAndRetry({
    userId: input.userId,
    provider: "github",
    accountId,
    apiCall: (accessToken) =>
      issuesCreate({
        accessToken,
        owner,
        repo,
        title: config.title,
        body: config.body,
        labels: config.labels,
        assignees: config.assignees,
        milestone: config.milestone,
      }),
  });

  return {
    output: {
      issueId: issue.id,
      issueNumber: issue.number,
      title: issue.title,
      body: issue.body ?? null,
      state: issue.state,
      url: issue.html_url,
      repository: config.repository,
      labels: (issue.labels ?? []).map((l) => l.name),
      assignees: (issue.assignees ?? []).map((a) => a.login),
      createdAt: issue.created_at ?? null,
    },
  };
};
