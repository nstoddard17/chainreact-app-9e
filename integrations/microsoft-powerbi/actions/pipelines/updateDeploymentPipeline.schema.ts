import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:update_deployment_pipeline`.
 *
 * At least one of `displayName` / `description` must be provided — an
 * empty PATCH is a config error, not a provider no-op.
 */
export const UpdateDeploymentPipelineConfigSchema = z
  .object({
    pipelineId: z.string().min(1),
    displayName: z.string().min(1).max(256).optional(),
    description: z.string().min(1).max(1024).optional(),
  })
  .strict()
  .refine(
    (config) =>
      config.displayName !== undefined || config.description !== undefined,
    "Provide a new name and/or description to update.",
  );

export type UpdateDeploymentPipelineConfig = z.infer<
  typeof UpdateDeploymentPipelineConfigSchema
>;
