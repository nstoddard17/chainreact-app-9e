// Generated from integrations/linear/mcp-catalog.ts + mcp-snapshot.json (npm run mcp:import -- generate linear).
// Curate the catalog and regenerate rather than hand-editing this file.
import { z } from "zod";

/** Config schema for `linear:update_issue` — mirrors updateIssue.meta.ts. */
export const UpdateIssueConfigSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    team: z.string().min(1).optional(),
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
    removeReleases: z.array(z.string().min(1)).min(1).optional(),
    blocks: z.array(z.string().min(1)).min(1).optional(),
    blockedBy: z.array(z.string().min(1)).min(1).optional(),
    relatedTo: z.array(z.string().min(1)).min(1).optional(),
    duplicateOf: z.string().min(1).optional(),
    removeBlocks: z.array(z.string().min(1)).min(1).optional(),
    removeBlockedBy: z.array(z.string().min(1)).min(1).optional(),
    removeRelatedTo: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

export type UpdateIssueConfig = z.infer<typeof UpdateIssueConfigSchema>;
