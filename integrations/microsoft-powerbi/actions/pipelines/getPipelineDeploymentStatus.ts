import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pipelineOperationGet } from "../../api/pipelines/pipelineOperationGet";
import { GetPipelineDeploymentStatusConfigSchema } from "./getPipelineDeploymentStatus.schema";

/**
 * Power BI `get_pipeline_deployment_status` action handler.
 *
 * Read-back for the async deploy actions: fetches one pipeline
 * operation. Authors compose a loop on `status` (NotStarted / Executing
 * / Succeeded / Failed) — V2 deliberately does NOT poll in-run. On
 * failure only the stable `errorCode` is surfaced, never raw details.
 *
 * Output shape (downstream variable refs):
 *   { status, executionStartTime, executionEndTime,
 *     sourceStageOrder, targetStageOrder, errorCode }
 */
export const getPipelineDeploymentStatus: ActionHandler = async (input) => {
  const config = GetPipelineDeploymentStatusConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      pipelineOperationGet({
        accessToken,
        pipelineId: config.pipelineId,
        operationId: config.operationId,
      }),
  });

  return {
    output: {
      status: result.status,
      executionStartTime: result.executionStartTime,
      executionEndTime: result.executionEndTime,
      sourceStageOrder: result.sourceStageOrder,
      targetStageOrder: result.targetStageOrder,
      errorCode: result.errorCode,
    },
  };
};
