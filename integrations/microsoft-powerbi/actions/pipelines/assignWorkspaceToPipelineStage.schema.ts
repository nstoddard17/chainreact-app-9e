import { z } from "zod";
import { StageOrderSchema } from "./deployAllPipelineContent.schema";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:assign_workspace_to_pipeline_stage`.
 *
 * `stageOrder` uses the shared stage-order union (picker string value or
 * numeric variable, normalized to number — empty strings rejected).
 */
export const AssignWorkspaceToPipelineStageConfigSchema = z
  .object({
    pipelineId: z.string().min(1),
    stageOrder: StageOrderSchema,
    workspaceId: z.string().min(1),
  })
  .strict();

export type AssignWorkspaceToPipelineStageConfig = z.infer<
  typeof AssignWorkspaceToPipelineStageConfigSchema
>;
