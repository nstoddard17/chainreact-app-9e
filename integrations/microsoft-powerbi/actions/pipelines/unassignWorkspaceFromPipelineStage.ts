import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pipelineStageUnassignWorkspace } from "../../api/pipelines/pipelineStageUnassignWorkspace";
import { UnassignWorkspaceFromPipelineStageConfigSchema } from "./unassignWorkspaceFromPipelineStage.schema";

/**
 * Power BI `unassign_workspace_from_pipeline_stage` action handler.
 *
 * Detaches the stage's workspace from the pipeline — the workspace and
 * its content are untouched; only the pipeline linkage is removed.
 *
 * Output shape (downstream variable refs):
 *   { unassigned, stageOrder }
 */
export const unassignWorkspaceFromPipelineStage: ActionHandler = async (
  input,
) => {
  const config = UnassignWorkspaceFromPipelineStageConfigSchema.parse(
    input.config,
  );

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      pipelineStageUnassignWorkspace({
        accessToken,
        pipelineId: config.pipelineId,
        stageOrder: config.stageOrder,
      }),
  });

  return {
    output: {
      unassigned: true,
      stageOrder: config.stageOrder,
    },
  };
};
