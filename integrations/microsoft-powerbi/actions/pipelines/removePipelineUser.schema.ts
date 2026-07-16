import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:remove_pipeline_user`.
 *
 * `principalIdentifier` is the same value Get Pipeline Users returns —
 * UPN/email for users, object id for groups/apps.
 */
export const RemovePipelineUserConfigSchema = z
  .object({
    pipelineId: z.string().min(1),
    principalIdentifier: z.string().min(1),
  })
  .strict();

export type RemovePipelineUserConfig = z.infer<
  typeof RemovePipelineUserConfigSchema
>;
