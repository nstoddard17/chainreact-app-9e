// Generated from integrations/linear/mcp-catalog.ts + mcp-snapshot.json (npm run mcp:import -- generate linear).
// Curate the catalog and regenerate rather than hand-editing this file.
import { z } from "zod";

/** Config schema for `linear:add_comment` — mirrors addComment.meta.ts. */
export const AddCommentConfigSchema = z
  .object({
    issueId: z.string().min(1),
    parentId: z.string().min(1).optional(),
    body: z.string().min(1),
  })
  .strict();

export type AddCommentConfig = z.infer<typeof AddCommentConfigSchema>;
