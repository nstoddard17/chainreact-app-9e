import { decryptToken } from "@/core/encryption/tokens";
import { type OptionItem, type OptionsResolver } from "@/services/options/types";
import { listBoards } from "@/integrations/_shared/eden/api/boards";
import { filterByLabel, mapEdenOptionsError, requireEdenIntegration } from "./_shared";

const BOARD_PAGE_LIMIT = 100;

/**
 * `eden:boards` options resolver (EDEN-4). Lists boards in a workspace. `workspaceId` is an OPTIONAL
 * cascade parent — when the field is empty Eden uses the account's default workspace, so this
 * resolver reads `ctx.deps.workspaceId` only if present (no `requiredDeps`). value = board id,
 * label = board title (falls back to id).
 */
export const edenBoardsResolver: OptionsResolver = {
  source: "eden:boards",
  provider: "eden",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireEdenIntegration(ctx);
    const accessToken = decryptToken(integration.accessTokenEncrypted);
    const workspaceId = typeof ctx.deps.workspaceId === "string" && ctx.deps.workspaceId.length > 0 ? ctx.deps.workspaceId : undefined;

    let result;
    try {
      result = await listBoards({ accessToken, ...(workspaceId ? { workspaceId } : {}), limit: BOARD_PAGE_LIMIT });
    } catch (err) {
      mapEdenOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const item of result.items) {
      if (item.id.length === 0) continue;
      const label = item.title && item.title.length > 0 ? item.title : item.id;
      items.push({ value: item.id, label });
    }
    return { items: filterByLabel(items, ctx.q).sort((a, b) => a.label.localeCompare(b.label)), hasMore: result.nextCursor !== null };
  },
};
