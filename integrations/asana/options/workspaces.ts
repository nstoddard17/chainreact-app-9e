import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { workspacesList } from "@/integrations/_shared/asana/api/workspaces";
import {
  filterAndSortByLabel,
  mapAsanaOptionsError,
  requireAsanaIntegration,
} from "./_shared";

/**
 * `asana:workspaces` options resolver — Slice 5.ASANA-1.
 *
 * The cascade ROOT every Asana action/trigger hangs off (workspace →
 * project → task; workspace → assignee). Account-scoped, no deps.
 * Wrapped in `refreshAndRetry` — Asana access tokens expire hourly.
 *
 * One page of 100; `hasMore` from Asana's `next_page` (workspace lists
 * are tiny in practice). Labels are workspace names (titles in the
 * user's own account — not secrets); gid fallback when unnamed.
 */
const PAGE_SIZE = 100;

export const asanaWorkspacesResolver: OptionsResolver = {
  source: "asana:workspaces",
  provider: "asana",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireAsanaIntegration(ctx);

    let page;
    try {
      page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "asana",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          workspacesList({ accessToken, limit: PAGE_SIZE }),
      });
    } catch (err) {
      mapAsanaOptionsError(err, "workspaces");
    }

    const items: OptionItem[] = [];
    for (const w of page.items) {
      if (typeof w.gid !== "string" || w.gid.length === 0) continue;
      const label =
        typeof w.name === "string" && w.name.length > 0 ? w.name : w.gid;
      items.push({ value: w.gid, label });
    }

    return { items: filterAndSortByLabel(items, ctx.q), hasMore: page.hasMore };
  },
};
