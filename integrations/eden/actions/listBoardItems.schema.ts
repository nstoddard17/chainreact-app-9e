import { z } from "zod";

/** `eden:list_board_items` — list the items on a board (one page). */
export const ListBoardItemsConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    boardId: z.string().min(1),
    limit: z.number().int().positive().max(100).optional(),
    cursor: z.string().optional(),
  })
  .strict();
export type ListBoardItemsConfig = z.infer<typeof ListBoardItemsConfigSchema>;
