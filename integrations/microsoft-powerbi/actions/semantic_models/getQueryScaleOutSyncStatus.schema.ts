import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:get_query_scale_out_sync_status`.
 */
export const GetQueryScaleOutSyncStatusConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
  })
  .strict();

export type GetQueryScaleOutSyncStatusConfig = z.infer<
  typeof GetQueryScaleOutSyncStatusConfigSchema
>;
