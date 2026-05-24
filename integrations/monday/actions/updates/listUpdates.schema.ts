import { z } from "zod";

/**
 * Resolved-config schema for the Monday `list_updates` action —
 * Slice 3.MONDAY-4.
 *
 * Pure read. V1 field names preserved:
 *   - `itemId` (required)
 *   - `limit` (optional) — 1..100, default 25.
 */
export const ListUpdatesConfigSchema = z
  .object({
    itemId: z
      .string({ required_error: "itemId is required." })
      .min(1, "itemId is required."),
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict();

export type ListUpdatesConfig = z.infer<typeof ListUpdatesConfigSchema>;
