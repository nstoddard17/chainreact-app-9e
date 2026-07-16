import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/pipelines/{pipelineId}/stages`
 * (Get Pipeline Stages).
 *
 * A stage row carries `order` (Development=0, Test=1, Production=2),
 * plus `workspaceId` / `workspaceName` when a workspace is assigned to
 * the stage. The REST stage object has NO displayName field — friendly
 * stage names are derived from the documented order semantics by the
 * options resolver, not here.
 */

export interface PipelineStagesListInput {
  accessToken: string;
  pipelineId: string;
}

export interface PowerBiPipelineStage {
  order: number;
  workspaceId: string | null;
  workspaceName: string | null;
}

interface PipelineStagesListBody {
  value?: Array<{
    order?: number;
    workspaceId?: string;
    workspaceName?: string;
  }>;
}

export async function pipelineStagesList(
  input: PipelineStagesListInput,
): Promise<PowerBiPipelineStage[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}/stages`,
    notFoundResource: `pipeline ${input.pipelineId}`,
    operation: "pipeline stages GET",
  });

  const body = (await res.json()) as PipelineStagesListBody;
  const rows = body.value ?? [];
  const stages: PowerBiPipelineStage[] = [];
  for (const row of rows) {
    if (typeof row.order !== "number" || !Number.isInteger(row.order))
      continue;
    stages.push({
      order: row.order,
      workspaceId:
        typeof row.workspaceId === "string" ? row.workspaceId : null,
      workspaceName:
        typeof row.workspaceName === "string" ? row.workspaceName : null,
    });
  }
  return stages;
}
