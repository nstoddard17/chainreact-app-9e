import { type OptionItem, type OptionsResolver } from "@/services/options/types";
import type { McpResolverDeps } from "@/integrations/_shared/mcp";
import {
  LINEAR_OPTIONS_PAGE,
  linearArray,
  linearHasMore,
  linearListTool,
  searchArg,
  str,
} from "./_shared";

/**
 * `linear:issues` — one bounded page of workspace issues (list_issues). Backs
 * the Issue pickers on Update Issue (`id`), Add Comment (`issueId`), and the
 * Parent issue fields on find/create/update (TEST-SUITE-GREEN-1, closing the
 * RESOLVERS-1 gap where those fields were raw "paste a UUID or LIN-123" text).
 *
 * Mapping comes from REAL captured live evidence (`mcp-evidence.json`,
 * list_issues): `{ issues: [{ id, title, status, team, teamId, … }],
 * hasNextPage, cursor }` → value = `id`, label = `title` qualified by `status`
 * and `team`. Linear's list_issues result carries NO `identifier` field (no
 * "LIN-123"), so the label is NOT built from one — the same honesty rule that
 * kept `identifier` off the certified outputs. `url` holds the human reference
 * and is deliberately NOT surfaced as a label (rule 7: no provider host/URL
 * leakage into builder-visible strings).
 *
 * NO deps, deliberately. `team` is not a cascade parent here: on Update Issue
 * the Team field means "MOVE the issue to this team", so filtering the issue
 * list by it would hide exactly the issue the author is trying to move, and Add
 * Comment has no team field at all. Authors narrow with the search box instead,
 * which Linear serves SERVER-side (`query` = "Search issue title or
 * description") rather than filtering one page in the browser.
 *
 * Server order is preserved (most-recently-updated first) instead of sorting
 * alphabetically — the issue an author wants to update or comment on is
 * overwhelmingly a recent one.
 */
export function makeLinearIssuesResolver(deps?: McpResolverDeps): OptionsResolver {
  return {
    source: "linear:issues",
    provider: "linear",
    requiresIntegration: true,
    async resolve(ctx) {
      const structured = await linearListTool(
        ctx,
        "list_issues",
        { limit: LINEAR_OPTIONS_PAGE, ...searchArg(ctx) },
        deps,
      );
      const items: OptionItem[] = [];
      for (const issue of linearArray(structured, "issues")) {
        const value = str(issue, "id");
        if (!value) continue;
        const title = str(issue, "title") ?? value;
        // Status + team disambiguate the many similarly-titled issues a real
        // workspace accumulates. Both are plain name strings in the captured
        // shape; either may be absent, so build the suffix from what exists.
        const qualifiers = [str(issue, "status"), str(issue, "team")].filter(
          (q): q is string => q !== undefined,
        );
        items.push({
          value,
          label: qualifiers.length > 0 ? `${title} — ${qualifiers.join(" · ")}` : title,
        });
      }
      return { items, hasMore: linearHasMore(structured) };
    },
  };
}

export const linearIssuesResolver: OptionsResolver = makeLinearIssuesResolver();
