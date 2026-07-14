import { z } from "zod";

/** `eden:create_board` — create a board in a workspace (default workspace when omitted). */
export const CreateBoardConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    title: z.string().min(1),
  })
  .strict();
export type CreateBoardConfig = z.infer<typeof CreateBoardConfigSchema>;
