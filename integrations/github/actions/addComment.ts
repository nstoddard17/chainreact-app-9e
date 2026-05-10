import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { issueCommentsCreate } from "../../_shared/github/api/issues";
import { AddCommentConfigSchema } from "./addComment.schema";
import { parseRepository } from "./_parseRepository";

/**
 * `add_comment` GitHub action handler — Slice 14b Batch 1.
 *
 * POSTs `/repos/{owner}/{repo}/issues/{issueNumber}/comments`.
 * Works for both issue and PR comments — GitHub treats PRs as
 * issues for the comment API's purposes.
 *
 * Output shape (downstream variable refs):
 *   { commentId, url, body, repository, issueNumber, createdAt }
 */
export const addComment: ActionHandler = async (input) => {
  const config = AddCommentConfigSchema.parse(input.config);
  const { owner, repo } = parseRepository(config.repository);

  const accountId =
    input.triggerEvent.provider === "github"
      ? input.triggerEvent.accountId
      : null;

  const comment = await refreshAndRetry({
    userId: input.userId,
    provider: "github",
    accountId,
    apiCall: (accessToken) =>
      issueCommentsCreate({
        accessToken,
        owner,
        repo,
        issueNumber: config.issueNumber,
        body: config.body,
      }),
  });

  return {
    output: {
      commentId: comment.id,
      url: comment.html_url,
      body: comment.body,
      repository: config.repository,
      issueNumber: config.issueNumber,
      createdAt: comment.created_at ?? null,
    },
  };
};
