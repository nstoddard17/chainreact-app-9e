import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { tasksGet } from "@/integrations/_shared/asana/api/tasks";
import { GetTaskConfigSchema } from "./getTask.schema";

/**
 * Asana `get_task` action handler — Slice 5.ASANA-1.
 *
 * GET /tasks/{gid} via the shared `tasksGet` wrapper (bounded opt_fields),
 * wrapped in `refreshAndRetry` (Q3). This is the chaining companion for
 * the compact webhook triggers — Asana events carry only gids, so
 * workflows chain `get_task` on `{{trigger.taskGid}}` for content.
 *
 * Output (bounded): { taskGid, taskName, notes, completed, completedAt,
 * dueOn, dueAt, assigneeGid, assigneeName, projectGids, permalinkUrl,
 * createdAt, modifiedAt }
 */
export const getTask: ActionHandler = async (input) => {
  const config = GetTaskConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "asana"
      ? input.triggerEvent.providerAccountId
      : null;

  const task = await refreshAndRetry({
    accountId: input.accountId,
    provider: "asana",
    providerAccountId,
    apiCall: (accessToken) =>
      tasksGet({ accessToken, taskGid: config.taskGid }),
  });

  return {
    output: {
      taskGid: task.gid,
      taskName: task.name ?? null,
      notes: task.notes ?? null,
      completed: task.completed ?? false,
      completedAt: task.completed_at ?? null,
      dueOn: task.due_on ?? null,
      dueAt: task.due_at ?? null,
      assigneeGid: task.assignee?.gid ?? null,
      assigneeName: task.assignee?.name ?? null,
      projectGids: (task.projects ?? []).map((p) => p.gid),
      permalinkUrl: task.permalink_url ?? null,
      createdAt: task.created_at ?? null,
      modifiedAt: task.modified_at ?? null,
    },
  };
};
