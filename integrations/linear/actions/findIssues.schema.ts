// Generated from integrations/linear/mcp-catalog.ts + mcp-snapshot.json (npm run mcp:import -- generate linear).
// Curate the catalog and regenerate rather than hand-editing this file.
import { z } from "zod";

/** Config schema for `linear:find_issues` — mirrors findIssues.meta.ts. */
export const FindIssuesConfigSchema = z
  .object({
    limit: z.number().max(250).optional(),
    cursor: z.string().min(1).optional(),
    orderBy: z.enum(["createdAt", "updatedAt"]).optional(),
    query: z.string().min(1).optional(),
    team: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    cycle: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    assignee: z.string().min(1).optional(),
    delegate: z.string().min(1).optional(),
    project: z.string().min(1).optional(),
    release: z.string().min(1).optional(),
    priority: z.number().optional(),
    parentId: z.string().min(1).optional(),
    createdAt: z.string().min(1).optional(),
    updatedAt: z.string().min(1).optional(),
    includeArchived: z.boolean().optional(),
  })
  .strict();

export type FindIssuesConfig = z.infer<typeof FindIssuesConfigSchema>;
