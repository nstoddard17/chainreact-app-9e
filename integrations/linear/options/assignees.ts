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
 * `linear:assignees` — workspace users (list_users). Backs the assignee field on
 * create/update/find issue. Mapping from real evidence:
 * `users: [{ id, name, displayName, email, … }]` → value = id, label =
 * displayName (else name). **User EMAIL is never surfaced** — label + value only.
 */
export function makeLinearAssigneesResolver(deps?: McpResolverDeps): OptionsResolver {
  return {
    source: "linear:assignees",
    provider: "linear",
    requiresIntegration: true,
    async resolve(ctx) {
      const structured = await linearListTool(ctx, "list_users", { limit: LINEAR_OPTIONS_PAGE, ...searchArg(ctx) }, deps);
      const items: OptionItem[] = [];
      for (const u of linearArray(structured, "users")) {
        const value = str(u, "id");
        if (!value) continue;
        // displayName → name → id. NEVER email (no-leak).
        items.push({ value, label: str(u, "displayName") ?? str(u, "name") ?? value });
      }
      return { items: sortByLabel(items), hasMore: linearHasMore(structured) };
    },
  };
}

export const linearAssigneesResolver: OptionsResolver = makeLinearAssigneesResolver();
