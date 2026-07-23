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
 * `linear:projects` — the workspace's projects (list_projects). Backs the
 * Project picker on find/create/update issue. `team` is an OPTIONAL cascade
 * filter (dependsOn team): when a team is selected the list narrows to that
 * team's projects; otherwise all projects. Mapping from real live evidence
 * (CS-6C, `mcp-evidence.json`): `projects: [{ id, name, … }]` → value = id,
 * label = name. Only id + name reach the browser (never the raw project body).
 */
export function makeLinearProjectsResolver(deps?: McpResolverDeps): OptionsResolver {
  return {
    source: "linear:projects",
    provider: "linear",
    requiresIntegration: true,
    async resolve(ctx) {
      const team = str(ctx.deps as Record<string, unknown>, "team");
      const structured = await linearListTool(
        ctx,
        "list_projects",
        { limit: LINEAR_OPTIONS_PAGE, ...(team ? { team } : {}), ...searchArg(ctx) },
        deps,
      );
      const items: OptionItem[] = [];
      for (const p of linearArray(structured, "projects")) {
        const value = str(p, "id");
        if (!value) continue;
        items.push({ value, label: str(p, "name") ?? value });
      }
      return { items: sortByLabel(items), hasMore: linearHasMore(structured) };
    },
  };
}

export const linearProjectsResolver: OptionsResolver = makeLinearProjectsResolver();
