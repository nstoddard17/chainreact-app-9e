import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { tasksCreate } from "@/integrations/_shared/asana/api/tasks";
import { CreateTaskConfigSchema } from "./createTask.schema";

/**
 * Asana `create_task` action handler — Slice 5.ASANA-1.
 *
 * POST /tasks via the shared `tasksCreate` wrapper. Principal outbound
 * write wrapped in `refreshAndRetry` (Q3) — Asana access tokens expire
 * hourly, so the 401 → refresh → retry path is the normal steady state.
 *
 * Idempotency: Asana's REST API exposes no idempotency-key mechanism for
 * task creation; V2 mirrors the Monday / Google Docs posture (no handler-
 * level dedup; engine retry policy owns within-run retries).
 *
 * Optional-field normalization: builder-cleared optional fields arrive as
 * "" — treated as "not provided" so the API call omits them entirely.
 *
 * Output (bounded — never the raw task record):
 *   { taskGid, taskName, permalinkUrl, assigneeGid, dueOn, completed,
 *     createdAt }
 */

function presentOrUndefined(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}

export const createTask: ActionHandler = async (input) => {
  const config = CreateTaskConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "asana"
      ? input.triggerEvent.providerAccountId
      : null;

  const task = await refreshAndRetry({
    accountId: input.accountId,
    provider: "asana",
    providerAccountId,
    apiCall: (accessToken) =>
      tasksCreate({
        accessToken,
        projectId: config.projectId,
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
      permalinkUrl: task.permalink_url ?? null,
      assigneeGid: task.assignee?.gid ?? null,
      dueOn: task.due_on ?? null,
      completed: task.completed ?? false,
      createdAt: task.created_at ?? null,
    },
  };
};
