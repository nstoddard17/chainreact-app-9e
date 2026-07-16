import { decryptToken } from "@/core/encryption/tokens";
import { reposAssigneesList } from "@/integrations/_shared/github/api/repos";
import { NotFoundError } from "@/integrations/_shared/github/errors";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import {
  filterAndSortByLabel,
  mapGithubOptionsError,
  parseRepositoryDep,
  requireGithubIntegration,
} from "./_shared";

/**
 * `github:assignees` options resolver — RESOLVERS-1.
 *
 * Backs the per-chip assignee picker on `create_issue.assignees`. Depends on
 * the meta's `repository` field (`owner/repo` — the exact value
 * `github:repos` stores), matching `github:branches`.
 *
 * Endpoint: `GET /repos/{owner}/{repo}/assignees?per_page=100` (one bounded
 * page; `repo` scope, already granted — no reconnect). This endpoint lists
 * exactly the users GitHub will ACCEPT as assignees on that repo, so the
 * picker can't offer a login the POST would silently drop.
 * Docs: https://docs.github.com/en/rest/issues/assignees?apiVersion=2022-11-28#list-assignees
 *
 * Behavior (mirrors `github:branches` exactly):
 *   - Decrypt-direct auth (GitHub is personal + non-refreshable — the
 *     `github:repos` / Slack / Trello pattern), NOT `refreshAndRetry`.
 *   - Dep value that isn't `owner/repo`-shaped → empty items (the author is
 *     mid-manual-entry; not an error).
 *   - Repo 404 (typo'd manual entry / no access) → empty items — the
 *     cascade-fallback posture (OneNote/Dropbox precedent), keeping manual
 *     entry usable.
 *   - `value` = `label` = the LOGIN. `create_issue.assignees` is `string[]`
 *     of logins, so the picker commits exactly what the runtime schema
 *     stores. A login is the user's public GitHub handle — the resolver
 *     deliberately reads NOTHING else off the user payload (no real `name`,
 *     no email, no avatar URL, no numeric id), so no collaborator PII
 *     reaches the browser.
 *   - Local `ctx.q` filtering + alpha sort; `hasMore` honest from the
 *     helper's `truncated` flag (authors type the exact login beyond the cap
 *     — `allowManualEntry` stays on).
 */
export const githubAssigneesResolver: OptionsResolver = {
  source: "github:assignees",
  provider: "github",
  requiresIntegration: true,
  requiredDeps: ["repository"],
  async resolve(ctx) {
    const integration = requireGithubIntegration(ctx);

    // The route validated presence/non-emptiness; shape is ours to check.
    const parsed = parseRepositoryDep(ctx.deps.repository ?? "");
    if (!parsed) return { items: [], hasMore: false };
    const { owner, repo } = parsed;

    const accessToken = decryptToken(integration.accessTokenEncrypted);

    let result;
    try {
      result = await reposAssigneesList({ accessToken, owner, repo });
    } catch (err) {
      if (err instanceof NotFoundError) {
        // Repo not found / no access — cascade fallback, not an error.
        return { items: [], hasMore: false };
      }
      // Safe, token-free observability line. NEVER the raw provider body.
      console.warn(
        JSON.stringify({
          event: "options.github_assignees.provider_error",
          source: "github:assignees",
        }),
      );
      mapGithubOptionsError(err, "assignees");
    }

    const items: OptionItem[] = result.assignees.map((a) => ({
      value: a.login,
      label: a.login,
    }));

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: result.truncated,
    };
  },
};
