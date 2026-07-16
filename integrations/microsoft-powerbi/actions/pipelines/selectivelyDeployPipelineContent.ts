import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pipelineDeploySelective } from "../../api/pipelines/pipelineDeploySelective";
import { SelectivelyDeployPipelineContentConfigSchema } from "./selectivelyDeployPipelineContent.schema";

/**
 * Power BI `selectively_deploy_pipeline_content` action handler.
 *
 * Deploys only the selected items (semantic models / reports /
 * dashboards / dataflows) from the source stage. Returns immediately
 * with the operation id — the deployment continues async provider-side;
 * pair with `get_pipeline_deployment_status` or the pipeline triggers.
 *
 * Output shape (downstream variable refs):
 *   { operationId, status }
 */
export const selectivelyDeployPipelineContent: ActionHandler = async (
  input,
) => {
  const config = SelectivelyDeployPipelineContentConfigSchema.parse(
    input.config,
  );

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      pipelineDeploySelective({
        accessToken,
        pipelineId: config.pipelineId,
        sourceStageOrder: config.sourceStageOrder,
        semanticModelIds: config.semanticModelIds,
        reportIds: config.reportIds,
        dashboardIds: config.dashboardIds,
        dataflowIds: config.dataflowIds,
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
