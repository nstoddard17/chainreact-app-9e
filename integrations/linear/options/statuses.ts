import { type OptionItem, type OptionsResolver } from "@/services/options/types";
import type { McpResolverDeps } from "@/integrations/_shared/mcp";
import { linearListToolArray, sortByLabel, str } from "./_shared";

/**
 * `linear:issue_statuses` — a team's workflow states (list_issue_statuses).
 * Backs the State picker on find/create/update issue. Linear statuses are
 * TEAM-SCOPED, so `team` is a REQUIRED cascade parent (dependsOn team): the
 * route short-circuits with a "choose a team first" state until the Team field
 * is set. Mapping from real live evidence (CS-6C, `mcp-evidence.json`): the tool
 * returns a TOP-LEVEL array `[{ id, type, name }]` → value = id, label = name.
 * (`type` is the state category — backlog/started/… — kept out of the label for
 * a clean list; the committed value is the id the runtime schema expects.)
 */
export function makeLinearIssueStatusesResolver(deps?: McpResolverDeps): OptionsResolver {
  return {
    source: "linear:issue_statuses",
    provider: "linear",
    requiresIntegration: true,
    requiredDeps: ["team"],
    async resolve(ctx) {
      const team = str(ctx.deps as Record<string, unknown>, "team");
      // requiredDeps guarantees presence, but stay defensive.
      if (!team) return { items: [], hasMore: false };
      const rows = await linearListToolArray(ctx, "list_issue_statuses", { team }, deps);
      const items: OptionItem[] = [];
      for (const s of rows) {
        const value = str(s, "id");
        if (!value) continue;
        items.push({ value, label: str(s, "name") ?? value });
      }
      return { items: sortByLabel(items), hasMore: false };
    },
  };
}

export const linearIssueStatusesResolver: OptionsResolver = makeLinearIssueStatusesResolver();
