import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { tasksListForProject } from "@/integrations/_shared/asana/api/tasks";
import {
  filterAndSortByLabel,
  mapAsanaOptionsError,
  requireAsanaIntegration,
} from "./_shared";

/**
 * `asana:tasks` options resolver — Slice 5.ASANA-1.
 *
 * Backs the `taskGid` picker on update_task / complete_task /
 * add_comment_to_task / get_task. Depends on `projectId` (`GET /tasks`
 * requires a project/tag/assignee+workspace anchor — research.md).
 * Completed tasks are labeled with a "Completed" description hint so
 * authors don't pick a done task by accident. `allowManualEntry` on the
 * field means upstream variables / pasted gids bypass this picker.
 */
const PAGE_SIZE = 100;

export const asanaTasksResolver: OptionsResolver = {
  source: "asana:tasks",
  provider: "asana",
  requiresIntegration: true,
  requiredDeps: ["projectId"],
  async resolve(ctx) {
    const integration = requireAsanaIntegration(ctx);
    const projectId = ctx.deps.projectId ?? "";

    let page;
    try {
      page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "asana",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          tasksListForProject({ accessToken, projectId, limit: PAGE_SIZE }),
      });
    } catch (err) {
      mapAsanaOptionsError(err, "tasks");
    }

    const items: OptionItem[] = [];
    for (const t of page.items) {
      if (typeof t.gid !== "string" || t.gid.length === 0) continue;
      const label =
        typeof t.name === "string" && t.name.length > 0 ? t.name : t.gid;
      items.push(
        t.completed === true
          ? { value: t.gid, label, description: "Completed" }
          : { value: t.gid, label },
      );
    }

    return { items: filterAndSortByLabel(items, ctx.q), hasMore: page.hasMore };
  },
};
