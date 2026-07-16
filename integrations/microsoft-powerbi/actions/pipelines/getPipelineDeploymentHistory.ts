import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pipelineOperationsList } from "../../api/pipelines/pipelineOperationsList";
import { GetPipelineDeploymentHistoryConfigSchema } from "./getPipelineDeploymentHistory.schema";

/** Client-side slice default when `top` is unset. */
const DEFAULT_TOP = 20;

/**
 * Power BI `get_pipeline_deployment_history` action handler.
 *
 * Lists the pipeline's recent deploy operations (provider returns the
 * 20 most recent; `top` slices that bounded list client-side). Fixed
 * per-operation key set — no raw provider rows.
 *
 * Output shape (downstream variable refs):
 *   { operations: [{ operationId, status, executionStartTime,
 *     executionEndTime, sourceStageOrder, targetStageOrder }], count }
 */
export const getPipelineDeploymentHistory: ActionHandler = async (input) => {
  const config = GetPipelineDeploymentHistoryConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      pipelineOperationsList({
        accessToken,
        pipelineId: config.pipelineId,
      }),
  });

  const top = config.top ?? DEFAULT_TOP;
  const operations = result.slice(0, top).map((op) => ({
    operationId: op.operationId,
    status: op.status,
    executionStartTime: op.executionStartTime,
    executionEndTime: op.executionEndTime,
    sourceStageOrder: op.sourceStageOrder,
    targetStageOrder: op.targetStageOrder,
  }));

  return {
    output: {
      operations,
      count: operations.length,
    },
  };
};
