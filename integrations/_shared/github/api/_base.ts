/**
 * Shared GitHub REST API base — URL + pinned API version + standard
 * headers helper.
 *
 * Mirrors `_shared/stripe/api/_base.ts` shape. The base URLs are
 * env-overridable for e2e (Slice 14b Commit 5 mock server); production
 * never sets the overrides and the defaults point at real GitHub.
 *
 *   - `githubAuthorizeBase()` — `https://github.com` (the host that
 *     serves the OAuth authorize + token endpoints).
 *   - `githubApiBase()` — `https://api.github.com` (the host that
 *     serves the REST API).
 *
 * The two are intentionally separate constants because GitHub serves
 * OAuth on a different origin than the REST API, and the e2e mock
 * server needs to point both at the same localhost port without
 * conflating them.
 *
 * The API version pin matches `integrations/github/manifest.ts` —
 * sent as `X-GitHub-Api-Version` header on every REST call (actions
 * + lifecycle). Bumping is a single-line edit here + manifest sync.
 */

export function githubAuthorizeBase(): string {
  return process.env.GITHUB_AUTHORIZE_BASE ?? "https://github.com";
}

export function githubApiBase(): string {
  return process.env.GITHUB_API_BASE ?? "https://api.github.com";
}

/**
 * Pinned GitHub REST API version. Mirrors V1's
 * `GitHubTriggerLifecycle.ts:95` and `github.ts` action handlers'
 * pin. Sent as the `X-GitHub-Api-Version` header on every REST call
 * — GitHub's API is versioned via this header (the request URL
 * itself is unversioned).
 */
export const GITHUB_API_VERSION = "2022-11-28";
