import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:get_dataflow_refresh_history`.
 *
 * `top` is a harmless bounding param (Q11-exempt): optional with a
 * documented wrapper default of 20. The provider endpoint has no
 * `$top` — bounding is a client-side slice in the wrapper.
 */
export const GetDataflowRefreshHistoryConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    dataflowId: z.string().min(1),
    top: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export type GetDataflowRefreshHistoryConfig = z.infer<
  typeof GetDataflowRefreshHistoryConfigSchema
>;
