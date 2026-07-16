import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/pipelines/{pipelineId}/operations/{operationId}`
 * (Get Pipeline Operation).
 *
 * The polling read-back for the async deploy actions. `status` is
 * `NotStarted | Executing | Succeeded | Failed`. On failure, only the
 * first `executionPlan.steps[].error.errorCode` is surfaced — a stable
 * code, never the raw error-details blob (bounded-output rule).
 */

export interface PipelineOperationGetInput {
  accessToken: string;
  pipelineId: string;
  operationId: string;
}

export interface PipelineOperationDetail {
  operationId: string;
  status: string;
  executionStartTime: string | null;
  executionEndTime: string | null;
  sourceStageOrder: number | null;
  targetStageOrder: number | null;
  errorCode: string | null;
}

interface PipelineOperationGetBody {
  id?: string;
  status?: string;
  executionStartTime?: string;
  executionEndTime?: string;
  sourceStageOrder?: number;
  targetStageOrder?: number;
  executionPlan?: {
    steps?: Array<{
      error?: { errorCode?: string };
    }>;
  };
}

export async function pipelineOperationGet(
  input: PipelineOperationGetInput,
): Promise<PipelineOperationDetail> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}/operations/${encodeURIComponent(
      input.operationId,
    )}`,
    notFoundResource: `pipeline operation ${input.operationId}`,
    operation: "pipeline operation GET",
  });

  const body = (await res.json()) as PipelineOperationGetBody;

  let errorCode: string | null = null;
  for (const step of body.executionPlan?.steps ?? []) {
    if (typeof step.error?.errorCode === "string" && step.error.errorCode) {
      errorCode = step.error.errorCode;
      break;
    }
  }

  return {
    operationId:
      typeof body.id === "string" ? body.id : input.operationId,
    status: typeof body.status === "string" ? body.status : "Unknown",
    executionStartTime:
      typeof body.executionStartTime === "string"
        ? body.executionStartTime
        : null,
    executionEndTime:
      typeof body.executionEndTime === "string"
        ? body.executionEndTime
        : null,
    sourceStageOrder:
      typeof body.sourceStageOrder === "number" ? body.sourceStageOrder : null,
    targetStageOrder:
      typeof body.targetStageOrder === "number" ? body.targetStageOrder : null,
    errorCode,
  };
}
