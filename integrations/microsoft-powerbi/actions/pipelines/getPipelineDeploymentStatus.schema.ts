import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:get_pipeline_deployment_status`.
 *
 * `operationId` is free text — it usually arrives as a variable from a
 * preceding deploy action's `operationId` output.
 */
export const GetPipelineDeploymentStatusConfigSchema = z
  .object({
    pipelineId: z.string().min(1),
    operationId: z.string().min(1),
  })
  .strict();

export type GetPipelineDeploymentStatusConfig = z.infer<
  typeof GetPipelineDeploymentStatusConfigSchema
>;
