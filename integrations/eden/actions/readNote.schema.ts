import { z } from "zod";

/** `eden:read_note` — read a note's markdown by item id. */
export const ReadNoteConfigSchema = z
  .object({ workspaceId: z.string().optional(), itemId: z.string().min(1) })
  .strict();
export type ReadNoteConfig = z.infer<typeof ReadNoteConfigSchema>;
