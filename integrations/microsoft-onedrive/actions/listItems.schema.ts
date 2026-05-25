import { z } from "zod";

/**
 * Resolved-config schema for the OneDrive list_items action.
 *
 * Lists children of the given parent folder. `parentItemId` optional —
 * when omitted / "root", lists the drive root.
 *
 * `top` is Graph's $top page-size param (1–1000; Graph default 200).
 * `orderBy` is Graph's $orderby clause, e.g.
 * `"name asc"` or `"lastModifiedDateTime desc"`.
 *
 * Slice 8 returns ONE page + the `nextLink` for forward-compat. Does
 * NOT auto-paginate (matches Slice 7 list_events).
 */
export const ListItemsConfigSchema = z
  .object({
    parentItemId: z.string().optional(),
    top: z.number().int().min(1).max(1000).optional(),
    orderBy: z.string().optional(),
  })
  .strict();

export type ListItemsConfig = z.infer<typeof ListItemsConfigSchema>;
