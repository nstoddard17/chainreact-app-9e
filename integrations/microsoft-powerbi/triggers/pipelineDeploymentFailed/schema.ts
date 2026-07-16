import { z } from "zod";

/**
 * Config schema for the Power BI `pipeline_deployment_failed` polling
 * trigger. `snapshot.seenOperationIds` tracks the pipeline operation ids
 * already observed in the `Failed` state.
 */
export const PowerBiPipelineDeploymentFailedConfigSchema = z.object({
  pipelineId: z.string().min(1),

  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      seenOperationIds: z.array(z.string()),
      updatedAt: z.string().min(1),
    })
    .optional(),
  polling: z.object({ lastPolledAt: z.string().min(1) }).optional(),
});

export type PowerBiPipelineDeploymentFailedConfig = z.infer<
  typeof PowerBiPipelineDeploymentFailedConfigSchema
>;
