import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { usersList } from "@/integrations/_shared/asana/api/users";
import {
  filterAndSortByLabel,
  mapAsanaOptionsError,
  requireAsanaIntegration,
} from "./_shared";

/**
 * `asana:users` options resolver — Slice 5.ASANA-1.
 *
 * Backs the `assigneeId` field on create_task / update_task. Depends on
 * `workspaceId`. Labels are display NAMES ONLY — V2 deliberately never
 * requests user emails for this picker (names identify assignees;
 * emails would be gratuitous PII in the browser).
 */
const PAGE_SIZE = 100;

export const asanaUsersResolver: OptionsResolver = {
  source: "asana:users",
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
          usersList({ accessToken, workspaceGid, limit: PAGE_SIZE }),
      });
    } catch (err) {
      mapAsanaOptionsError(err, "users");
    }

    const items: OptionItem[] = [];
    for (const u of page.items) {
      if (typeof u.gid !== "string" || u.gid.length === 0) continue;
      const label =
        typeof u.name === "string" && u.name.length > 0 ? u.name : u.gid;
      items.push({ value: u.gid, label });
    }

    return { items: filterAndSortByLabel(items, ctx.q), hasMore: page.hasMore };
  },
};
