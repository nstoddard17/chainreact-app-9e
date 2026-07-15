import { z } from "zod";

/** `eden:rename_note` — change a note's title. */
export const RenameNoteConfigSchema = z
  .object({ workspaceId: z.string().optional(), itemId: z.string().min(1), title: z.string().min(1) })
  .strict();
export type RenameNoteConfig = z.infer<typeof RenameNoteConfigSchema>;
