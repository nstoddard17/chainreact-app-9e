import { decryptToken } from "@/core/encryption/tokens";
import { reposBranchesList } from "@/integrations/_shared/github/api/repos";
import { NotFoundError } from "@/integrations/_shared/github/errors";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import {
  filterAndSortByLabel,
  mapGithubOptionsError,
  requireGithubIntegration,
} from "./_shared";

/**
 * `github:branches` options resolver — RESOLVERS-1.
 *
 * Backs the branch pickers on `create_pull_request` (`head` / `base`),
 * `create_branch` (`sourceBranch`), and the `new_commit` trigger's
 * `branch` filter. Depends on the meta's `repository` field
 * (`owner/repo` — the exact value `github:repos` stores).
 *
 * Endpoint: `GET /repos/{owner}/{repo}/branches?per_page=100` (one
 * bounded page; `repo` scope, already granted).
 * Docs: https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28#list-branches
 *
 * Behavior:
 *   - Decrypt-direct auth (GitHub is personal + non-refreshable — the
 *     `github:repos` / Slack / Trello pattern), NOT `refreshAndRetry`.
 *   - Dep value that isn't `owner/repo`-shaped → empty items (the
 *     author is mid-manual-entry; not an error).
 *   - Repo 404 (typo'd manual entry / no access) → empty items — the
 *     cascade-fallback posture (OneNote/Dropbox precedent), keeping
 *     manual entry usable.
 *   - Labels are branch names ONLY; `protected` surfaces as a
 *     "Protected" description hint. No commit SHAs / URLs / payloads.
 *   - Local `ctx.q` filtering + alpha sort; `hasMore` honest from the
 *     helper's `truncated` flag (authors type the exact name beyond
 *     the cap — `allowManualEntry` stays on).
 */
export const githubBranchesResolver: OptionsResolver = {
  source: "github:branches",
  provider: "github",
  requiresIntegration: true,
  requiredDeps: ["repository"],
  async resolve(ctx) {
    const integration = requireGithubIntegration(ctx);

    // The route validated presence/non-emptiness; shape is ours to check.
    const repository = ctx.deps.repository ?? "";
    const slash = repository.indexOf("/");
    if (
      slash <= 0 ||
      slash === repository.length - 1 ||
      repository.slice(slash + 1).includes("/") ||
      /\s/.test(repository)
    ) {
      // Not `owner/repo`-shaped (e.g. mid-typing manual entry) — an
      // empty list with manual entry beats a scary error state.
      return { items: [], hasMore: false };
    }
    const owner = repository.slice(0, slash);
    const repo = repository.slice(slash + 1);

    const accessToken = decryptToken(integration.accessTokenEncrypted);

    let result;
    try {
      result = await reposBranchesList({ accessToken, owner, repo });
    } catch (err) {
      if (err instanceof NotFoundError) {
        // Repo not found / no access — cascade fallback, not an error.
        return { items: [], hasMore: false };
      }
      // Safe, token-free observability line. NEVER the raw provider body.
      console.warn(
        JSON.stringify({
          event: "options.github_branches.provider_error",
          source: "github:branches",
        }),
      );
      mapGithubOptionsError(err, "branches");
    }

    const items: OptionItem[] = result.branches.map((b) =>
      b.protected
        ? { value: b.name, label: b.name, description: "Protected" }
        : { value: b.name, label: b.name },
    );

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: result.truncated,
    };
  },
};
