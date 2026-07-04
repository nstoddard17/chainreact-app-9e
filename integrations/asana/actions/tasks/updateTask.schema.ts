import { z } from "zod";

/**
 * Resolved-config schema for `asana:update_task` — Slice 5.ASANA-1.
 *
 * Asana PUT /tasks/{gid} is a partial update — only provided fields
 * change. Empty strings are treated as "not provided" (builder-cleared
 * optional fields), so clearing a task's notes to "" is out of scope for
 * this slice (documented divergence; use the Asana UI to clear fields).
 *
 * At least one updatable field must be effectively present — an update
 * that changes nothing is a config error, not a silent no-op provider
 * call.
 *
 * `workspaceId` / `projectId` are UI-scope only (cascade for the task
 * picker); the API call targets `taskGid` directly.
 */
const nonEmpty = (v: string | undefined): boolean =>
  v !== undefined && v.length > 0;

export const UpdateTaskConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    projectId: z.string().optional(),
    taskGid: z
      .string({ required_error: "taskGid is required." })
      .min(1, "taskGid is required."),
    name: z.string().optional(),
    notes: z.string().optional(),
    assigneeId: z.string().optional(),
    dueOn: z
      .union([
        z.literal(""),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueOn must be YYYY-MM-DD."),
      ])
      .optional(),
  })
  .strict()
  .refine(
    (c) =>
      nonEmpty(c.name) ||
      nonEmpty(c.notes) ||
      nonEmpty(c.assigneeId) ||
      nonEmpty(c.dueOn),
    {
      message:
        "update_task requires at least one of name / notes / assigneeId / dueOn.",
    },
  );

export type UpdateTaskConfig = z.infer<typeof UpdateTaskConfigSchema>;
