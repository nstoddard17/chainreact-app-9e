import { z } from "zod";

/** `eden:rename_board` — change a board's name. */
export const RenameBoardConfigSchema = z
  .object({ workspaceId: z.string().optional(), boardId: z.string().min(1), name: z.string().min(1) })
  .strict();
export type RenameBoardConfig = z.infer<typeof RenameBoardConfigSchema>;
