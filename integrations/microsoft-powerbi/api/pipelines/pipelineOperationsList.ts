import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/pipelines/{pipelineId}/operations`
 * (Get Pipeline Operations).
 *
 * Returns the pipeline's most recent deploy operations — the provider
 * itself caps the list at the 20 most recent (no paging params). The
 * action applies its own client-side `top` slice on this bounded list.
 */

export interface PipelineOperationsListInput {
  accessToken: string;
  pipelineId: string;
}

export interface PipelineOperationSummary {
  operationId: string;
  status: string;
  executionStartTime: string | null;
  executionEndTime: string | null;
  sourceStageOrder: number | null;
  targetStageOrder: number | null;
}

interface PipelineOperationsListBody {
  value?: Array<{
    id?: string;
    status?: string;
    executionStartTime?: string;
    executionEndTime?: string;
    sourceStageOrder?: number;
    targetStageOrder?: number;
  }>;
}

export async function pipelineOperationsList(
  input: PipelineOperationsListInput,
): Promise<PipelineOperationSummary[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}/operations`,
    notFoundResource: `pipeline ${input.pipelineId}`,
    operation: "pipeline operations GET",
  });

  const body = (await res.json()) as PipelineOperationsListBody;
  const rows = body.value ?? [];
  const operations: PipelineOperationSummary[] = [];
  for (const row of rows) {
    if (typeof row.id !== "string" || row.id.length === 0) continue;
    operations.push({
      operationId: row.id,
      status: typeof row.status === "string" ? row.status : "Unknown",
      executionStartTime:
        typeof row.executionStartTime === "string"
          ? row.executionStartTime
          : null,
      executionEndTime:
        typeof row.executionEndTime === "string"
          ? row.executionEndTime
          : null,
      sourceStageOrder:
        typeof row.sourceStageOrder === "number"
          ? row.sourceStageOrder
          : null,
      targetStageOrder:
        typeof row.targetStageOrder === "number"
          ? row.targetStageOrder
          : null,
    });
  }
  return operations;
}
