import { decryptToken } from "@/core/encryption/tokens";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { userReposList } from "@/integrations/_shared/github/api/repos";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";

/**
 * `github:repos` options resolver — Slice ANALYTICS-SOURCES-GITHUB-UI-3.
 *
 * Backs the searchable repository picker in the Analytics GitHub widget config
 * (and any future GitHub `owner/repo` field). Lists the EDITOR'S OWN accessible
 * repositories so the author doesn't have to guess the exact `owner/repo`.
 *
 * Behavior (mirrors the Slack `slack:channels` resolver):
 *   - `requiresIntegration: true` — the route loads the caller's active GitHub
 *     integration and short-circuits with `INTEGRATION_DISCONNECTED` before
 *     dispatch when there's none, so a missing connection becomes a "Connect
 *     GitHub" style state, not a thrown error.
 *   - GitHub is a PERSONAL credential, and the analytics options call carries NO
 *     workflow context, so the route resolves the caller's OWN GitHub connection
 *     (credentialPolicy → "legacy"). The picker therefore lists the EDITOR's
 *     repos only — never a co-member's. At render time each viewer still queries
 *     with their own token, so a co-member never receives the author's repo list
 *     or cached result.
 *   - Decrypt-direct: GitHub is non-refreshable, so the resolver decrypts the
 *     stored token and calls the read helper directly (same model as Slack /
 *     Trello), not `refreshAndRetry`.
 *   - Maps each repo to `{ value: full_name, label: full_name }` (+ a "Private"
 *     hint). `q` filters client-side (case-insensitive substring on `owner/repo`).
 *   - `hasMore` passes through the helper's `truncated` flag so the renderer can
 *     tell the author to type the full `owner/repo` if theirs isn't listed.
 *
 * Error sanitization — leak-free, and never marks another provider broken:
 *   - 401 → `PROVIDER_REAUTH_REQUIRED` (GitHub tokens are non-refreshable;
 *     reconnect is the fix).
 *   - rate limit → `PROVIDER_ERROR` ("try again shortly").
 *   - anything else → generic `PROVIDER_ERROR`.
 *   - Never carries the raw GitHub error body, token, or repo payload in the
 *     thrown message; a safe event (no token, no body) is logged server-side.
 */

function classifyGithubReposError(err: unknown): OptionsResolverError {
  if (err instanceof OptionsResolverError) return err;
  if (err instanceof Unauthorized401Error) {
    return new OptionsResolverError(
      "PROVIDER_REAUTH_REQUIRED",
      "Reconnect GitHub to load your repositories.",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/rate limit/i.test(message)) {
    return new OptionsResolverError(
      "PROVIDER_ERROR",
      "GitHub's rate limit was reached. Try again shortly.",
    );
  }
  return new OptionsResolverError(
    "PROVIDER_ERROR",
    "Couldn't load your GitHub repositories. Try again.",
  );
}

export const githubReposResolver: OptionsResolver = {
  source: "github:repos",
  provider: "github",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      // The route guards this for `requiresIntegration: true`; defensive throw,
      // classified the same way the route would.
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "Connect GitHub to pick a repository.",
      );
    }
    const accessToken = decryptToken(ctx.integration.accessTokenEncrypted);

    let result;
    try {
      result = await userReposList({ accessToken });
    } catch (err) {
      const reauth = err instanceof Unauthorized401Error;
      // Safe, token-free observability line. NEVER the raw provider body.
      console.warn(
        JSON.stringify({
          event: "options.github_repos.provider_error",
          source: "github:repos",
          class: reauth ? "auth" : "provider",
        }),
      );
      throw classifyGithubReposError(err);
    }

    const lowerQ = ctx.q.toLowerCase();
    const items = result.repos
      .filter((r) => lowerQ.length === 0 || r.fullName.toLowerCase().includes(lowerQ))
      .map((r) =>
        r.private
          ? { value: r.fullName, label: r.fullName, description: "Private" }
          : { value: r.fullName, label: r.fullName },
      );

    return { items, hasMore: result.truncated };
  },
};
