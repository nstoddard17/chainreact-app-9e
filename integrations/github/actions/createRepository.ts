import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { userReposCreate } from "../../_shared/github/api/repos";
import { CreateRepositoryConfigSchema } from "./createRepository.schema";

/**
 * `create_repository` GitHub action handler — Slice 14b Batch 1.
 *
 * POSTs `/user/repos` with the user's access token. Creates a
 * repository owned by the authenticated user (organization-owned
 * creation needs `POST /orgs/{org}/repos` — deferred to a future
 * slice).
 *
 * Output shape (downstream variable refs):
 *   { repositoryId, name, fullName, description, private, url,
 *     cloneUrl, sshUrl, defaultBranch }
 *
 *   `{{nodeId.fullName}}` is the typical reference for downstream
 *   `create_issue` / `create_branch` / `create_pull_request` chains.
 */
export const createRepository: ActionHandler = async (input) => {
  const config = CreateRepositoryConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "github"
      ? input.triggerEvent.accountId
      : null;

  const repository = await refreshAndRetry({
    userId: input.userId,
    provider: "github",
    accountId,
    apiCall: (accessToken) =>
      userReposCreate({
        accessToken,
        name: config.name,
        description: config.description,
        private: config.private,
        auto_init: config.auto_init,
        gitignore_template: config.gitignore_template,
        license_template: config.license_template,
        homepage: config.homepage,
      }),
  });

  return {
    output: {
      repositoryId: repository.id,
      name: repository.name,
      fullName: repository.full_name,
      description: repository.description ?? null,
      private: repository.private,
      url: repository.html_url,
      cloneUrl: repository.clone_url ?? null,
      sshUrl: repository.ssh_url ?? null,
      defaultBranch: repository.default_branch,
      homepage: repository.homepage ?? null,
    },
  };
};
