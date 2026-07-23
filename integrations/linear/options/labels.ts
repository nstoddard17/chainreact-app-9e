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
 * `linear:labels` — the workspace's issue labels (list_issue_labels). Backs the
 * labels field on create/update issue and the label filter on find issue.
 * Mapping from real evidence: `labels: [{ id, name, color, description }]` →
 * value = id, label = name. list_issue_labels searches on `name`.
 */
export function makeLinearLabelsResolver(deps?: McpResolverDeps): OptionsResolver {
  return {
    source: "linear:labels",
    provider: "linear",
    requiresIntegration: true,
    async resolve(ctx) {
      const structured = await linearListTool(ctx, "list_issue_labels", { limit: LINEAR_OPTIONS_PAGE, ...searchArg(ctx, "name") }, deps);
      const items: OptionItem[] = [];
      for (const l of linearArray(structured, "labels")) {
        const value = str(l, "id");
        if (!value) continue;
        items.push({ value, label: str(l, "name") ?? value });
      }
      return { items: sortByLabel(items), hasMore: linearHasMore(structured) };
    },
  };
}

export const linearLabelsResolver: OptionsResolver = makeLinearLabelsResolver();
