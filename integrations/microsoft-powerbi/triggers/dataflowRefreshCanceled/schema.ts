import { z } from "zod";

/**
 * Config schema for the Power BI `dataflow_refresh_canceled` polling
 * trigger. `snapshot.seenTransactionIds` tracks the dataflow transaction
 * ids already observed in the cancelled state.
 */
export const PowerBiDataflowRefreshCanceledConfigSchema = z.object({
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

export type PowerBiDataflowRefreshCanceledConfig = z.infer<
  typeof PowerBiDataflowRefreshCanceledConfigSchema
>;
