import { z } from "zod";

/** `eden:update_note` — REPLACE a note's content (rewrite). */
export const UpdateNoteConfigSchema = z
  .object({ workspaceId: z.string().optional(), itemId: z.string().min(1), content: z.string().min(1) })
  .strict();
export type UpdateNoteConfig = z.infer<typeof UpdateNoteConfigSchema>;
