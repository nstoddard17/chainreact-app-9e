import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { tasksUpdate } from "@/integrations/_shared/asana/api/tasks";
import { CompleteTaskConfigSchema } from "./completeTask.schema";

/**
 * Asana `complete_task` action handler — Slice 5.ASANA-1.
 *
 * PUT /tasks/{gid} `{ completed: true }` via the shared `tasksUpdate`
 * wrapper, wrapped in `refreshAndRetry` (Q3). Idempotent at the provider:
 * completing an already-completed task is a no-op that returns the task.
 *
 * Output (bounded): { taskGid, completed, completedAt }
 */
export const completeTask: ActionHandler = async (input) => {
  const config = CompleteTaskConfigSchema.parse(input.config);

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
        completed: true,
      }),
  });

  return {
    output: {
      taskGid: task.gid,
      completed: task.completed ?? true,
      completedAt: task.completed_at ?? null,
    },
  };
};
