import { z } from "zod";

/** `eden:save_links_to_board` — save one or more URLs onto a board. */
export const SaveLinksToBoardConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    boardId: z.string().min(1),
    urls: z.array(z.string().url()).min(1).max(50),
  })
  .strict();
export type SaveLinksToBoardConfig = z.infer<typeof SaveLinksToBoardConfigSchema>;
