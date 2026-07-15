import { decryptToken } from "@/core/encryption/tokens";
import { type OptionItem, type OptionsResolver } from "@/services/options/types";
import { listWorkspaceItems } from "@/integrations/_shared/eden/api/items";
import { filterByLabel, mapEdenOptionsError, requireEdenIntegration } from "./_shared";

const NOTE_PAGE_LIMIT = 100;

/**
 * `eden:notes` options resolver (EDEN-5). Lists note items in a workspace. `workspaceId` is an
 * OPTIONAL cascade parent (default workspace when absent). value = note id, label = title (→ id).
 */
export const edenNotesResolver: OptionsResolver = {
  source: "eden:notes",
  provider: "eden",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireEdenIntegration(ctx);
    const accessToken = decryptToken(integration.accessTokenEncrypted);
    const workspaceId = typeof ctx.deps.workspaceId === "string" && ctx.deps.workspaceId.length > 0 ? ctx.deps.workspaceId : undefined;

    let result;
    try {
      // Eden notes are workspace items of type `markdown` (live-cert finding, EDEN-5).
      result = await listWorkspaceItems({ accessToken, ...(workspaceId ? { workspaceId } : {}), type: "markdown", limit: NOTE_PAGE_LIMIT });
    } catch (err) {
      mapEdenOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const it of result.items) {
      if (it.id.length === 0) continue;
      items.push({ value: it.id, label: it.title && it.title.length > 0 ? it.title : it.id });
    }
    return { items: filterByLabel(items, ctx.q).sort((a, b) => a.label.localeCompare(b.label)), hasMore: result.nextCursor !== null };
  },
};
