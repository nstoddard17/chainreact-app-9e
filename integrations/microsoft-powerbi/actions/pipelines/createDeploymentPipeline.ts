import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pipelineCreate } from "../../api/pipelines/pipelineCreate";
import { CreateDeploymentPipelineConfigSchema } from "./createDeploymentPipeline.schema";

/**
 * Power BI `create_deployment_pipeline` action handler.
 *
 * Creates an empty deployment pipeline. Stages are unassigned — chain
 * `assign_workspace_to_pipeline_stage` to wire workspaces in. Using the
 * pipeline (assign/deploy) requires the workspaces to be on Premium /
 * Fabric capacity.
 *
 * Output shape (downstream variable refs):
 *   { pipelineId, displayName }
 */
export const createDeploymentPipeline: ActionHandler = async (input) => {
  const config = CreateDeploymentPipelineConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      pipelineCreate({
        accessToken,
        displayName: config.displayName,
        description: config.description,
      }),
  });

  return {
    output: {
      pipelineId: result.pipelineId,
      displayName: result.displayName,
    },
  };
};
