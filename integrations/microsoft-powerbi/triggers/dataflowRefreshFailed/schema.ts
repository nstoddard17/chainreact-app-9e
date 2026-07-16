import { z } from "zod";

/**
 * Config schema for the Power BI `dataflow_refresh_failed` polling
 * trigger. `snapshot.seenTransactionIds` tracks the dataflow transaction
 * ids already observed in the failed state.
 */
export const PowerBiDataflowRefreshFailedConfigSchema = z.object({
  workspaceId: z.string().min(1),
  dataflowId: z.string().min(1),

  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      seenTransactionIds: z.array(z.string()),
      updatedAt: z.string().min(1),
    })
    .optional(),
  polling: z.object({ lastPolledAt: z.string().min(1) }).optional(),
});

export type PowerBiDataflowRefreshFailedConfig = z.infer<
  typeof PowerBiDataflowRefreshFailedConfigSchema
>;
