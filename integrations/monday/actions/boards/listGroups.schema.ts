import { z } from "zod";

/**
 * Resolved-config schema for the Monday `list_groups` action —
 * Slice 3.MONDAY-4.
 *
 * Pure read. V1 field name preserved:
 *   - `boardId` (required)
 */
export const ListGroupsConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
  })
  .strict();

export type ListGroupsConfig = z.infer<typeof ListGroupsConfigSchema>;
