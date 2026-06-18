import { githubRequest } from "@/integrations/_shared/github/api/_request";

/**
 * Minimal READ-ONLY GitHub API surface for analytics (Slice
 * ANALYTICS-SOURCES-GITHUB-1). Reuses the shared `githubRequest` helper (same
 * `token` auth header, API-version pin, and 401→Unauthorized401Error mapping as
 * the GitHub action handlers) so analytics never re-implements auth.
 *
 * ONLY the Search API is used: it returns an exact `total_count` per query with
 * NO pagination, so counts + time series are computed with a bounded number of
 * calls. No write/mutating endpoint is reachable from here.
 */

export interface GithubSearchCount {
  total: number;
  /** GitHub set `incomplete_results` (timed out / partial) → surfaced as a warning. */
  incomplete: boolean;
}

/**
 * `GET /search/issues?q=...` → total match count. `per_page=1` keeps the payload
 * tiny (we only read `total_count`). `q` is built server-side from validated
 * inputs (see buckets.ts) — never raw widget JSON.
 */
export async function searchIssueCount(
  accessToken: string,
  q: string,
): Promise<GithubSearchCount> {
  const query = new URLSearchParams({ q, per_page: "1" });
  const res = await githubRequest<{
    total_count: number;
    incomplete_results: boolean;
  }>({
    accessToken,
    method: "GET",
    path: "/search/issues",
    query,
    resourceForNotFound: "GitHub search",
  });
  return {
    total: typeof res.total_count === "number" ? res.total_count : 0,
    incomplete: Boolean(res.incomplete_results),
  };
}
