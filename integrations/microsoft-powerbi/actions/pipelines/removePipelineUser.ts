import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pipelineUserDelete } from "../../api/pipelines/pipelineUserDelete";
import { RemovePipelineUserConfigSchema } from "./removePipelineUser.schema";

/**
 * Power BI `remove_pipeline_user` action handler.
 *
 * Removes a principal's deployment-pipeline access. Workspace roles are
 * untouched — only the pipeline permission is revoked.
 *
 * Output shape (downstream variable refs):
 *   { removed, principalIdentifier }
 */
export const removePipelineUser: ActionHandler = async (input) => {
  const config = RemovePipelineUserConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      pipelineUserDelete({
        accessToken,
        pipelineId: config.pipelineId,
        identifier: config.principalIdentifier,
      }),
  });

  return {
    output: {
      removed: true,
      principalIdentifier: config.principalIdentifier,
    },
  };
};
