import { z } from "zod";

/**
 * Resolved-config schema for the Monday `create_group` action —
 * Slice 3.MONDAY-4.
 *
 * V1 field names preserved:
 *   - `boardId` (required)
 *   - `groupTitle` (required) — V1 accepted legacy `groupName`; V2
 *     standardizes on `groupTitle` (the field maps to Monday's
 *     `group_name` mutation arg, which sets the group title).
 *   - `color` (optional) — Monday group color.
 */
export const CreateGroupConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
    groupTitle: z
      .string({ required_error: "groupTitle is required." })
      .min(1, "groupTitle is required."),
    color: z.string().min(1).optional(),
  })
  .strict();

export type CreateGroupConfig = z.infer<typeof CreateGroupConfigSchema>;
