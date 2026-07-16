import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/pipelines/{pipelineId}/stages/{stageOrder}/unassignWorkspace`
 * (Unassign Workspace).
 *
 * Detaches the stage's workspace from the pipeline — the workspace and
 * its content are untouched; only the pipeline linkage is removed. The
 * request carries no body.
 */

export interface PipelineStageUnassignWorkspaceInput {
  accessToken: string;
  pipelineId: string;
  stageOrder: number;
}

export async function pipelineStageUnassignWorkspace(
  input: PipelineStageUnassignWorkspaceInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}/stages/${encodeURIComponent(
      String(input.stageOrder),
    )}/unassignWorkspace`,
    notFoundResource: `pipeline ${input.pipelineId} stage ${input.stageOrder}`,
    operation: "pipeline stage unassignWorkspace POST",
  });
}
