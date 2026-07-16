import { z } from "zod";
import { StageOrderSchema } from "./deployAllPipelineContent.schema";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:unassign_workspace_from_pipeline_stage`.
 */
export const UnassignWorkspaceFromPipelineStageConfigSchema = z
  .object({
    pipelineId: z.string().min(1),
    stageOrder: StageOrderSchema,
  })
  .strict();

export type UnassignWorkspaceFromPipelineStageConfig = z.infer<
  typeof UnassignWorkspaceFromPipelineStageConfigSchema
>;
