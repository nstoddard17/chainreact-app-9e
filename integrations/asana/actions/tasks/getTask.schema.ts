import { z } from "zod";

/**
 * Resolved-config schema for `asana:get_task` — Slice 5.ASANA-1.
 *
 * Read-only fetch of one task by gid with the bounded opt_fields set
 * (see `_shared/asana/api/tasks.ts`). `workspaceId` / `projectId` are
 * UI-scope only for the task-picker cascade.
 */
export const GetTaskConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    projectId: z.string().optional(),
    taskGid: z
      .string({ required_error: "taskGid is required." })
      .min(1, "taskGid is required."),
  })
  .strict();

export type GetTaskConfig = z.infer<typeof GetTaskConfigSchema>;
