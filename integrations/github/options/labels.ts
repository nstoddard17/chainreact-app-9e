import { decryptToken } from "@/core/encryption/tokens";
import { reposLabelsList } from "@/integrations/_shared/github/api/repos";
import { NotFoundError } from "@/integrations/_shared/github/errors";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import {
  filterAndSortByLabel,
  mapGithubOptionsError,
  parseRepositoryDep,
  requireGithubIntegration,
} from "./_shared";

/**
 * `github:labels` options resolver — RESOLVERS-1.
 *
 * Backs the per-chip label picker on `create_issue.labels`. Depends on the
 * meta's `repository` field (`owner/repo` — the exact value `github:repos`
 * stores), matching `github:branches`.
 *
 * Endpoint: `GET /repos/{owner}/{repo}/labels?per_page=100` (one bounded
 * page; `repo` scope, already granted — no reconnect).
 * Docs: https://docs.github.com/en/rest/issues/labels?apiVersion=2022-11-28#list-labels-for-a-repository
 *
 * Behavior (mirrors `github:branches` exactly):
 *   - Decrypt-direct auth (GitHub is personal + non-refreshable — the
 *     `github:repos` / Slack / Trello pattern), NOT `refreshAndRetry`.
 *   - Dep value that isn't `owner/repo`-shaped → empty items (the author is
 *     mid-manual-entry; not an error).
 *   - Repo 404 (typo'd manual entry / no access) → empty items — the
 *     cascade-fallback posture (OneNote/Dropbox precedent), keeping manual
 *     entry usable.
 *   - `value` = `label` = the label NAME. `create_issue.labels` is `string[]`
 *     of names (the POST body sends names verbatim), so the picker commits
 *     exactly what the runtime schema stores. No numeric label ids, no
 *     colors, no descriptions, no URLs.
 *   - Local `ctx.q` filtering + alpha sort; `hasMore` honest from the
 *     helper's `truncated` flag (authors type the exact name beyond the cap
 *     — `allowManualEntry` stays on).
 */
export const githubLabelsResolver: OptionsResolver = {
  source: "github:labels",
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
      result = await reposLabelsList({ accessToken, owner, repo });
    } catch (err) {
      if (err instanceof NotFoundError) {
        // Repo not found / no access — cascade fallback, not an error.
        return { items: [], hasMore: false };
      }
      // Safe, token-free observability line. NEVER the raw provider body.
      console.warn(
        JSON.stringify({
          event: "options.github_labels.provider_error",
          source: "github:labels",
        }),
      );
      mapGithubOptionsError(err, "labels");
    }

    const items: OptionItem[] = result.labels.map((l) => ({
      value: l.name,
      label: l.name,
    }));

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: result.truncated,
    };
  },
};
