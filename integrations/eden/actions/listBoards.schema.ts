import { z } from "zod";

/** `eden:list_boards` — list boards (canvases) in a workspace (one page). */
export const ListBoardsConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
    cursor: z.string().optional(),
  })
  .strict();
export type ListBoardsConfig = z.infer<typeof ListBoardsConfigSchema>;
