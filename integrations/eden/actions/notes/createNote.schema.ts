import { z } from "zod";

/** `eden:create_note` — create a note on a board. */
export const CreateNoteConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    boardId: z.string().min(1),
    title: z.string().optional(),
    content: z.string().optional(),
  })
  .strict();
export type CreateNoteConfig = z.infer<typeof CreateNoteConfigSchema>;
