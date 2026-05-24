import { z } from "zod";

/**
 * Resolved-config schema for the Monday `get_board` action —
 * Slice 3.MONDAY-4.
 *
 * Pure read. V1 field name preserved:
 *   - `boardId` (required)
 */
export const GetBoardConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
  })
  .strict();

export type GetBoardConfig = z.infer<typeof GetBoardConfigSchema>;
