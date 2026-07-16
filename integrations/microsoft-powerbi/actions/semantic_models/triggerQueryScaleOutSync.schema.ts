import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:trigger_query_scale_out_sync`.
 * The endpoint takes no body — the config only addresses the model.
 */
export const TriggerQueryScaleOutSyncConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
  })
  .strict();

export type TriggerQueryScaleOutSyncConfig = z.infer<
  typeof TriggerQueryScaleOutSyncConfigSchema
>;
