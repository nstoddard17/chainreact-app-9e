import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { tasksUpdate } from "@/integrations/_shared/asana/api/tasks";
import { UpdateTaskConfigSchema } from "./updateTask.schema";

/**
 * Asana `update_task` action handler — Slice 5.ASANA-1.
 *
 * PUT /tasks/{gid} via the shared `tasksUpdate` wrapper (partial update:
 * only the provided fields change). Principal write wrapped in
 * `refreshAndRetry` (Q3). Empty-string optionals are omitted from the
 * call entirely (see the schema doc).
 *
 * Output (bounded): { taskGid, taskName, permalinkUrl, assigneeGid,
 * dueOn, completed, modifiedAt }
 */

function presentOrUndefined(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}

export const updateTask: ActionHandler = async (input) => {
  const config = UpdateTaskConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "asana"
      ? input.triggerEvent.providerAccountId
      : null;

  const task = await refreshAndRetry({
    accountId: input.accountId,
    provider: "asana",
    providerAccountId,
    apiCall: (accessToken) =>
      tasksUpdate({
        accessToken,
        taskGid: config.taskGid,
        name: presentOrUndefined(config.name),
        notes: presentOrUndefined(config.notes),
        assigneeGid: presentOrUndefined(config.assigneeId),
        dueOn: presentOrUndefined(config.dueOn),
      }),
  });

  return {
    output: {
      taskGid: task.gid,
      taskName: task.name ?? null,
      permalinkUrl: task.permalink_url ?? null,
      assigneeGid: task.assignee?.gid ?? null,
      dueOn: task.due_on ?? null,
      completed: task.completed ?? false,
      modifiedAt: task.modified_at ?? null,
    },
  };
};
