import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:get_pipeline_deployment_history`.
 *
 * `top` is a harmless bounding param (optional, wrapper-side list is
 * provider-capped at the 20 most recent; the handler slices client-side,
 * default 20) — the one class of field Q11 allows a documented default
 * for.
 */
export const GetPipelineDeploymentHistoryConfigSchema = z
  .object({
    pipelineId: z.string().min(1),
    top: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export type GetPipelineDeploymentHistoryConfig = z.infer<
  typeof GetPipelineDeploymentHistoryConfigSchema
>;
