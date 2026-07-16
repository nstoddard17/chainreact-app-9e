import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pipelineStageAssignWorkspace } from "../../api/pipelines/pipelineStageAssignWorkspace";
import { AssignWorkspaceToPipelineStageConfigSchema } from "./assignWorkspaceToPipelineStage.schema";

/**
 * Power BI `assign_workspace_to_pipeline_stage` action handler.
 *
 * Assigns a workspace to a pipeline stage. Provider-side constraints
 * (stage already assigned, caller not a workspace admin, workspace in
 * another pipeline, active deployment in flight) propagate as classified
 * provider errors.
 *
 * Output shape (downstream variable refs):
 *   { assigned, stageOrder, workspaceId }
 */
export const assignWorkspaceToPipelineStage: ActionHandler = async (input) => {
  const config = AssignWorkspaceToPipelineStageConfigSchema.parse(
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
      pipelineStageAssignWorkspace({
        accessToken,
        pipelineId: config.pipelineId,
        stageOrder: config.stageOrder,
        workspaceId: config.workspaceId,
      }),
  });

  return {
    output: {
      assigned: true,
      stageOrder: config.stageOrder,
      workspaceId: config.workspaceId,
    },
  };
};
