import { z } from "zod";

/**
 * Config schema for the Power BI `pipeline_deployment_completed` polling
 * trigger. `snapshot.seenOperationIds` tracks the pipeline operation ids
 * already observed in the `Succeeded` state.
 *
 * Pipelines are tenant-scoped, not workspace-scoped — the config carries
 * only `pipelineId` (research.md §2.5: pipeline endpoints live at
 * `/v1.0/myorg/pipelines/...`, outside `/groups/{id}`).
 */
export const PowerBiPipelineDeploymentCompletedConfigSchema = z.object({
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

export type PowerBiPipelineDeploymentCompletedConfig = z.infer<
  typeof PowerBiPipelineDeploymentCompletedConfigSchema
>;
