import { z } from "zod";
import { PowerBiWorkspaceItemTypeSchema } from "../workspaceItemAdded/schema";

/**
 * Zod schema for the Power BI `workspace_item_removed` polling trigger.
 *
 * Mirror image of `workspace_item_added`: same sources, same namespaced
 * `${itemType}:${id}` snapshot ids, same required `itemTypes` filter — the
 * only difference is which side of the set difference fires. The item-type
 * enum is shared with the added trigger so the two can never drift.
 */
export const PowerBiWorkspaceItemRemovedConfigSchema = z.object({
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

export type PowerBiWorkspaceItemRemovedConfig = z.infer<
  typeof PowerBiWorkspaceItemRemovedConfigSchema
>;
