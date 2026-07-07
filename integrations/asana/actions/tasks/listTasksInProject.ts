import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { tasksListPageForProject } from "@/integrations/_shared/asana/api/tasks";
import { ListTasksInProjectConfigSchema } from "./listTasksInProject.schema";

/**
 * Asana `list_tasks_in_project` action handler — ASANA-2.
 *
 * GET /tasks?project={gid} via the shared `tasksListPageForProject`
 * wrapper (held scope tasks:read), wrapped in `refreshAndRetry` (Q3).
 * Digest/backfill companion for the webhook triggers.
 *
 * Pagination: one page per run (Asana cursor model). `nextOffset` is
 * Asana's opaque `next_page.offset` — feed it back into the `offset`
 * field (e.g. from a previous run's output) to fetch the next page;
 * null on the last page.
 *
 * Output (bounded per task — never the raw record):
 *   { tasks: [{ taskGid, taskName, completed, dueOn, assigneeGid,
 *     permalinkUrl }], count, hasMore, nextOffset }
 */
export const listTasksInProject: ActionHandler = async (input) => {
  const config = ListTasksInProjectConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "asana"
      ? input.triggerEvent.providerAccountId
      : null;

  const page = await refreshAndRetry({
    accountId: input.accountId,
    provider: "asana",
    providerAccountId,
    apiCall: (accessToken) =>
      tasksListPageForProject({
        accessToken,
        projectId: config.projectId,
        limit: config.pageSize ?? 50,
        offset:
          config.offset !== undefined && config.offset.length > 0
            ? config.offset
            : undefined,
      }),
  });

  return {
    output: {
      tasks: page.items.map((t) => ({
        taskGid: t.gid,
        taskName: t.name ?? null,
        completed: t.completed ?? false,
        dueOn: t.due_on ?? null,
        assigneeGid: t.assignee?.gid ?? null,
        permalinkUrl: t.permalink_url ?? null,
      })),
      count: page.items.length,
      hasMore: page.hasMore,
      nextOffset: page.nextOffset,
    },
  };
};
