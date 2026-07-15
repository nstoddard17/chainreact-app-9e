import { decryptToken } from "@/core/encryption/tokens";
import { type OptionItem, type OptionsResolver } from "@/services/options/types";
import { listPrompts } from "@/integrations/_shared/eden/api/library";
import { filterByLabel, mapEdenOptionsError, requireEdenIntegration } from "./_shared";

/**
 * `eden:prompts` options resolver (EDEN-5). Lists saved prompts/skills. `workspaceId` is an OPTIONAL
 * cascade parent (default workspace when absent). value = prompt id, label = title (→ id).
 */
export const edenPromptsResolver: OptionsResolver = {
  source: "eden:prompts",
  provider: "eden",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireEdenIntegration(ctx);
    const accessToken = decryptToken(integration.accessTokenEncrypted);
    const workspaceId = typeof ctx.deps.workspaceId === "string" && ctx.deps.workspaceId.length > 0 ? ctx.deps.workspaceId : undefined;

    let result;
    try {
      result = await listPrompts({ accessToken, ...(workspaceId ? { workspaceId } : {}) });
    } catch (err) {
      mapEdenOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const p of result.prompts) {
      if (p.id.length === 0) continue;
      items.push({ value: p.id, label: p.title && p.title.length > 0 ? p.title : p.id });
    }
    return { items: filterByLabel(items, ctx.q).sort((a, b) => a.label.localeCompare(b.label)), hasMore: false };
  },
};
