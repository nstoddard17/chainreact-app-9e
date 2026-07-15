import { z } from "zod";

/** `eden:read_board` — read a bounded summary of a board by its item id. */
export const ReadBoardConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    itemId: z.string().min(1),
  })
  .strict();
export type ReadBoardConfig = z.infer<typeof ReadBoardConfigSchema>;
