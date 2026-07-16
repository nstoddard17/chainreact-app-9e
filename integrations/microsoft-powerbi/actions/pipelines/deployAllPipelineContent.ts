import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pipelineDeployAll } from "../../api/pipelines/pipelineDeployAll";
import { DeployAllPipelineContentConfigSchema } from "./deployAllPipelineContent.schema";

/**
 * Power BI `deploy_all_pipeline_content` action handler.
 *
 * Starts a Deploy All from the source stage to the next stage (previous
 * when backward) and returns immediately with the operation id — the
 * deployment continues async provider-side. Pair with
 * `get_pipeline_deployment_status` (loop) or the pipeline triggers to
 * observe completion.
 *
 * Output shape (downstream variable refs):
 *   { operationId, status }
 */
export const deployAllPipelineContent: ActionHandler = async (input) => {
  const config = DeployAllPipelineContentConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      pipelineDeployAll({
        accessToken,
        pipelineId: config.pipelineId,
        sourceStageOrder: config.sourceStageOrder,
        isBackwardDeployment: config.isBackwardDeployment,
        options: {
          allowCreateArtifact: config.allowCreateArtifact,
          allowOverwriteArtifact: config.allowOverwriteArtifact,
          allowPurgeData: config.allowPurgeData,
        },
      }),
  });

  return {
    output: {
      operationId: result.operationId,
      status: result.status,
    },
  };
};
