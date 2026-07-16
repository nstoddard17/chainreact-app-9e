import { z } from "zod";

/**
 * Zod schema for the Power BI `dax_query_result_changed` polling trigger.
 *
 * Snapshot stores only the SHA-256 of the bounded result rows, never the
 * rows themselves — `trigger_resources.config` is infrastructure state, not
 * a data store, and query results can carry business-confidential figures.
 *
 * `maxRows` bounds BOTH the emitted payload and the hashed window: a change
 * confined to rows past the bound does not fire. That trade keeps the
 * payload engine-sized; the emitted `rowCount` / `truncated` tell the
 * author when their window is clipped.
 */
export const PowerBiDaxQueryResultChangedConfigSchema = z.object({
  workspaceId: z.string().min(1),
  semanticModelId: z.string().min(1),
  daxQuery: z.string().min(1),
  maxRows: z.number().int().min(1).max(100),

  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      resultHash: z.string().min(1),
      updatedAt: z.string().min(1),
    })
    .optional(),
  polling: z.object({ lastPolledAt: z.string().min(1) }).optional(),
});

export type PowerBiDaxQueryResultChangedConfig = z.infer<
  typeof PowerBiDaxQueryResultChangedConfigSchema
>;
