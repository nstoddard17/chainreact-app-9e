import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/pipelines/{pipelineId}/stages/{stageOrder}/assignWorkspace`
 * (Assign Workspace).
 *
 * Assigns a workspace to a pipeline stage. Provider constraints (all
 * surface as classified provider errors): stage must not already have a
 * workspace, caller must be an ADMIN of the workspace, the workspace
 * must not belong to another pipeline, and the call fails during an
 * active deployment. Scopes: `Pipeline.ReadWrite.All` +
 * `Workspace.ReadWrite.All`.
 */

export interface PipelineStageAssignWorkspaceInput {
  accessToken: string;
  pipelineId: string;
  stageOrder: number;
  workspaceId: string;
}

export async function pipelineStageAssignWorkspace(
  input: PipelineStageAssignWorkspaceInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}/stages/${encodeURIComponent(
      String(input.stageOrder),
    )}/assignWorkspace`,
    body: { workspaceId: input.workspaceId },
    notFoundResource: `pipeline ${input.pipelineId} stage ${input.stageOrder}`,
    operation: "pipeline stage assignWorkspace POST",
  });
}
