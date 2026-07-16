import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:cancel_dataflow_refresh`.
 *
 * `dataflowId` is NOT part of the provider cancel URL (transactions sit
 * directly under `/dataflows/`), but it is kept in the config to drive
 * the transaction-picker cascade in the builder.
 */
export const CancelDataflowRefreshConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    dataflowId: z.string().min(1),
    transactionId: z.string().min(1),
  })
  .strict();

export type CancelDataflowRefreshConfig = z.infer<
  typeof CancelDataflowRefreshConfigSchema
>;
