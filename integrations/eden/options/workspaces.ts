import { decryptToken } from "@/core/encryption/tokens";
import { type OptionItem, type OptionsResolver } from "@/services/options/types";
import { listWorkspaces } from "@/integrations/_shared/eden/api/workspaces";
import { filterByLabel, mapEdenOptionsError, requireEdenIntegration } from "./_shared";

/**
 * `eden:workspaces` options resolver (EDEN-4). Top-level picker (no deps). value = workspace id,
 * label = workspace name (falls back to id). Workspace names are the user's own titles, not secrets;
 * the account email in the envelope is dropped by `listWorkspaces`.
 */
export const edenWorkspacesResolver: OptionsResolver = {
  source: "eden:workspaces",
  provider: "eden",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireEdenIntegration(ctx);
    const accessToken = decryptToken(integration.accessTokenEncrypted);

    let result;
    try {
      result = await listWorkspaces({ accessToken });
    } catch (err) {
      mapEdenOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const ws of result.workspaces) {
      const label = ws.name && ws.name.length > 0 ? ws.name : ws.id;
      items.push({ value: ws.id, label });
    }
    return { items: filterByLabel(items, ctx.q).sort((a, b) => a.label.localeCompare(b.label)), hasMore: false };
  },
};
