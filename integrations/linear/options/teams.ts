import { type OptionItem, type OptionsResolver } from "@/services/options/types";
import type { McpResolverDeps } from "@/integrations/_shared/mcp";
import {
  LINEAR_OPTIONS_PAGE,
  linearArray,
  linearHasMore,
  linearListTool,
  searchArg,
  sortByLabel,
  str,
} from "./_shared";

/**
 * `linear:teams` — the workspace's teams (list_teams). Cascade root for the
 * team field on create/update/find issue. Mapping from real evidence:
 * `teams: [{ id, name }]` → value = id, label = name.
 */
export function makeLinearTeamsResolver(deps?: McpResolverDeps): OptionsResolver {
  return {
    source: "linear:teams",
    provider: "linear",
    requiresIntegration: true,
    async resolve(ctx) {
      const structured = await linearListTool(ctx, "list_teams", { limit: LINEAR_OPTIONS_PAGE, ...searchArg(ctx) }, deps);
      const items: OptionItem[] = [];
      for (const t of linearArray(structured, "teams")) {
        const value = str(t, "id");
        if (!value) continue;
        items.push({ value, label: str(t, "name") ?? value });
      }
      return { items: sortByLabel(items), hasMore: linearHasMore(structured) };
    },
  };
}

export const linearTeamsResolver: OptionsResolver = makeLinearTeamsResolver();
