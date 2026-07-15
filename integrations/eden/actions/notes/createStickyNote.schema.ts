import { z } from "zod";

/** `eden:create_sticky_note` — add a sticky note to a board. */
export const CreateStickyNoteConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    boardId: z.string().min(1),
    content: z.string().min(1),
    color: z.string().optional(),
  })
  .strict();
export type CreateStickyNoteConfig = z.infer<typeof CreateStickyNoteConfigSchema>;
