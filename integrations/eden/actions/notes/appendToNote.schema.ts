import { z } from "zod";

/** `eden:append_to_note` — append Markdown to an existing note. */
export const AppendToNoteConfigSchema = z
  .object({ workspaceId: z.string().optional(), itemId: z.string().min(1), content: z.string().min(1) })
  .strict();
export type AppendToNoteConfig = z.infer<typeof AppendToNoteConfigSchema>;
