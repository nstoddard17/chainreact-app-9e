import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:create_deployment_pipeline`.
 *
 * Length caps mirror the provider contract (displayName ≤256,
 * description ≤1024). `description` is omitted from the request body
 * when unset.
 */
export const CreateDeploymentPipelineConfigSchema = z
  .object({
    displayName: z.string().min(1).max(256),
    description: z.string().min(1).max(1024).optional(),
  })
  .strict();

export type CreateDeploymentPipelineConfig = z.infer<
  typeof CreateDeploymentPipelineConfigSchema
>;
