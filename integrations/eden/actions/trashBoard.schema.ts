import { z } from "zod";

/** `eden:trash_board` — move a board to trash (reversible in Eden). */
export const TrashBoardConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    boardId: z.string().min(1),
  })
  .strict();
export type TrashBoardConfig = z.infer<typeof TrashBoardConfigSchema>;
