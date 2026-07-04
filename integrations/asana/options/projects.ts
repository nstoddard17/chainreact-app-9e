import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { projectsList } from "@/integrations/_shared/asana/api/projects";
import {
  filterAndSortByLabel,
  mapAsanaOptionsError,
  requireAsanaIntegration,
} from "./_shared";

/**
 * `asana:projects` options resolver — Slice 5.ASANA-1.
 *
 * Backs the `projectId` field on every Asana action/trigger. Depends on
 * `workspaceId` (the route validates the dep before dispatch). Requests
 * un-archived projects only; one page of 100 with `hasMore` from
 * `next_page` — the docs warn GET /projects "may timeout for large
 * domains", so authors with huge workspaces refine via the search box.
 */
const PAGE_SIZE = 100;

export const asanaProjectsResolver: OptionsResolver = {
  source: "asana:projects",
  provider: "asana",
  requiresIntegration: true,
  requiredDeps: ["workspaceId"],
  async resolve(ctx) {
    const integration = requireAsanaIntegration(ctx);
    const workspaceGid = ctx.deps.workspaceId ?? "";

    let page;
    try {
      page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "asana",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          projectsList({ accessToken, workspaceGid, limit: PAGE_SIZE }),
      });
    } catch (err) {
      mapAsanaOptionsError(err, "projects");
    }

    const items: OptionItem[] = [];
    for (const p of page.items) {
      if (typeof p.gid !== "string" || p.gid.length === 0) continue;
      const label =
        typeof p.name === "string" && p.name.length > 0 ? p.name : p.gid;
      items.push({ value: p.gid, label });
    }

    return { items: filterAndSortByLabel(items, ctx.q), hasMore: page.hasMore };
  },
};
