import { z } from "zod";

/**
 * Resolved-config schema for the Monday `duplicate_board` action —
 * Slice 3.MONDAY-4.
 *
 * V1 field names preserved:
 *   - `boardId` (required) — source board.
 *   - `duplicateType` (optional, default `duplicate_board_with_structure`).
 *     The default is the LEAST data-copying option (structure only, no
 *     items) — a safe default that doesn't silently clone potentially
 *     sensitive item data. Authors opt into copying items / updates
 *     explicitly. Not a "hidden high-risk default" (it doesn't change
 *     visibility/sharing/notify) — it's the conservative choice.
 *   - `newBoardName` (optional) — name for the new board. V1 accepted
 *     legacy `boardName`; V2 standardizes on `newBoardName`.
 */
export const DuplicateBoardConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
    duplicateType: z
      .enum([
        "duplicate_board_with_structure",
        "duplicate_board_with_pulses",
        "duplicate_board_with_pulses_and_updates",
      ])
      .default("duplicate_board_with_structure"),
    newBoardName: z.string().min(1).optional(),
  })
  .strict();

export type DuplicateBoardConfig = z.infer<typeof DuplicateBoardConfigSchema>;
