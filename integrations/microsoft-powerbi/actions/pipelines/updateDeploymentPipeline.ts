import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pipelineUpdate } from "../../api/pipelines/pipelineUpdate";
import { UpdateDeploymentPipelineConfigSchema } from "./updateDeploymentPipeline.schema";

/**
 * Power BI `update_deployment_pipeline` action handler.
 *
 * Updates the pipeline's display name and/or description (schema
 * requires at least one). Only fields the author set are sent.
 *
 * Output shape (downstream variable refs):
 *   { updated, pipelineId }
 */
export const updateDeploymentPipeline: ActionHandler = async (input) => {
  const config = UpdateDeploymentPipelineConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      pipelineUpdate({
        accessToken,
        pipelineId: config.pipelineId,
        displayName: config.displayName,
        description: config.description,
      }),
  });

  return {
    output: {
      updated: true,
      pipelineId: config.pipelineId,
    },
  };
};
