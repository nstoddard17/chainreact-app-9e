import { z } from "zod";

/** `eden:list_notes` — list note items in a workspace (one page). */
export const ListNotesConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
    cursor: z.string().optional(),
  })
  .strict();
export type ListNotesConfig = z.infer<typeof ListNotesConfigSchema>;
