// Generated from integrations/linear/mcp-catalog.ts + mcp-snapshot.json (npm run mcp:import -- generate linear).
// Curate the catalog and regenerate rather than hand-editing this file.
import { z } from "zod";

/** Config schema for `linear:create_issue` — mirrors createIssue.meta.ts. */
export const CreateIssueConfigSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    team: z.string().min(1),
    cycle: z.string().min(1).optional(),
    milestone: z.string().min(1).optional(),
    priority: z.coerce.number().int().min(0).max(4).optional(),
    project: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    assignee: z.string().min(1).optional(),
    delegate: z.string().min(1).optional(),
    labels: z.array(z.string().min(1)).min(1).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    slaBreachesAt: z.string().min(1).optional(),
    slaType: z.enum(["all", "onlyBusinessDays"]).optional(),
    parentId: z.string().min(1).optional(),
    estimate: z.number().min(0).optional(),
    links: z.array(z
      .object({
      url: z.string(),
      title: z.string(),
      })
      .strict()).min(1).optional(),
    setReleases: z.array(z.string().min(1)).min(1).optional(),
    addReleases: z.array(z.string().min(1)).min(1).optional(),
    blocks: z.array(z.string().min(1)).min(1).optional(),
    blockedBy: z.array(z.string().min(1)).min(1).optional(),
    relatedTo: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

export type CreateIssueConfig = z.infer<typeof CreateIssueConfigSchema>;
