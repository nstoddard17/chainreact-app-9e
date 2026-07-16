import { z } from "zod";

/**
 * Zod schema for the Power BI `workspace_item_added` polling trigger.
 *
 * Snapshot ids are NAMESPACED `${itemType}:${id}` so a report and a
 * semantic model that happen to share a GUID can never collide in the set
 * difference.
 *
 * `itemTypes` is required with no default: it selects which list endpoints
 * the poller calls, so an implicit "all" would silently add API calls (and
 * a dashboards scope requirement) the author never asked for.
 */
export const PowerBiWorkspaceItemTypeSchema = z.enum([
  "report",
  "semantic_model",
  "dashboard",
  "dataflow",
]);

export const PowerBiWorkspaceItemAddedConfigSchema = z.object({
  workspaceId: z.string().min(1),
  itemTypes: z.array(PowerBiWorkspaceItemTypeSchema).min(1),

  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      ids: z.array(z.string()),
      updatedAt: z.string().min(1),
    })
    .optional(),
  polling: z.object({ lastPolledAt: z.string().min(1) }).optional(),
});

export type PowerBiWorkspaceItemAddedConfig = z.infer<
  typeof PowerBiWorkspaceItemAddedConfigSchema
>;
