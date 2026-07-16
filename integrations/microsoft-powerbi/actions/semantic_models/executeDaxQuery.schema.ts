import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:execute_dax_query`.
 *
 * Q11: `maxRows` is REQUIRED with no silent default — it bounds how much
 * provider data enters workflow variables (the handler truncates the
 * result client-side; Power BI itself returns up to 100k rows).
 * `includeNulls` / `impersonatedUserName` are advanced and sent to the
 * provider only when set.
 */
export const ExecuteDaxQueryConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
    daxQuery: z.string().min(1),
    maxRows: z.number().int().min(1).max(1000),
    includeNulls: z.boolean().optional(),
    impersonatedUserName: z.string().min(1).optional(),
  })
  .strict();

export type ExecuteDaxQueryConfig = z.infer<typeof ExecuteDaxQueryConfigSchema>;
