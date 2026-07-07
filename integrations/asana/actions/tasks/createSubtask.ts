import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { tasksCreateSubtask } from "@/integrations/_shared/asana/api/tasks";
import { CreateSubtaskConfigSchema } from "./createSubtask.schema";

/**
 * Asana `create_subtask` action handler — ASANA-2.
 *
 * POST /tasks/{parent_gid}/subtasks via the shared `tasksCreateSubtask`
 * wrapper (held scope tasks:write). Principal outbound write wrapped in
 * `refreshAndRetry` (Q3) — Asana access tokens expire hourly, so the
 * 401 → refresh → retry path is the normal steady state.
 *
 * Idempotency: same posture as create_task — Asana exposes no
 * idempotency-key mechanism for task creation; engine retry policy owns
 * within-run retries.
 *
 * Optional-field normalization: builder-cleared optional fields arrive
 * as "" — treated as "not provided" so the API call omits them entirely.
 *
 * Output (bounded — never the raw task record):
 *   { taskGid, taskName, parentTaskGid, permalinkUrl, assigneeGid,
 *     dueOn, completed, createdAt }
 */

function presentOrUndefined(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}

export const createSubtask: ActionHandler = async (input) => {
  const config = CreateSubtaskConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "asana"
      ? input.triggerEvent.providerAccountId
      : null;

  const task = await refreshAndRetry({
    accountId: input.accountId,
    provider: "asana",
    providerAccountId,
    apiCall: (accessToken) =>
      tasksCreateSubtask({
        accessToken,
        parentTaskGid: config.parentTaskGid,
        name: config.name,
        notes: presentOrUndefined(config.notes),
        assigneeGid: presentOrUndefined(config.assigneeId),
        dueOn: presentOrUndefined(config.dueOn),
      }),
  });

  return {
    output: {
      taskGid: task.gid,
      taskName: task.name ?? config.name,
      parentTaskGid: config.parentTaskGid,
      permalinkUrl: task.permalink_url ?? null,
      assigneeGid: task.assignee?.gid ?? null,
      dueOn: task.due_on ?? null,
      completed: task.completed ?? false,
      createdAt: task.created_at ?? null,
    },
  };
};
