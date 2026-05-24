import { z } from "zod";

/**
 * Resolved-config schema for the Monday `list_subitems` action —
 * Slice 3.MONDAY-4.
 *
 * Pure read. V1 field name preserved:
 *   - `parentItemId` (required) — the item whose subitems to list.
 */
export const ListSubitemsConfigSchema = z
  .object({
    parentItemId: z
      .string({ required_error: "parentItemId is required." })
      .min(1, "parentItemId is required."),
  })
  .strict();

export type ListSubitemsConfig = z.infer<typeof ListSubitemsConfigSchema>;
