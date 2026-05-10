import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  GITHUB_API_VERSION,
  githubApiBase,
} from "./_base";
import {
  NotFoundError,
  ValidationError,
  surfaceGitHubError,
} from "../errors";

/**
 * Shared HTTP request helper for GitHub REST API wrappers.
 *
 * Slice 14b Commit 3. Mirrors `_shared/shopify/api/_request.ts` and
 * `_shared/hubspot/api/_request.ts` shape — thin per-resource
 * wrappers (repos.ts, issues.ts, pulls.ts, gists.ts) construct path +
 * body and delegate to this helper for HTTP semantics + auth + error
 * mapping.
 *
 * Wire-format:
 *   - `Authorization: token <access_token>` — GitHub's idiomatic
 *     header name for OAuth App tokens. **NOT** `Bearer`. V1's
 *     [`GitHubTriggerLifecycle.ts:92`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/GitHubTriggerLifecycle.ts#L92)
 *     mistakenly uses `Bearer`; V1 actions correctly use `token` —
 *     V2 standardizes to `token` everywhere.
 *   - `Accept: application/vnd.github+json` — GitHub's recommended
 *     versioned-JSON Accept header.
 *   - `X-GitHub-Api-Version: 2022-11-28` — pinned API version. The
 *     URL itself is unversioned; the header is the contract.
 *   - `Content-Type: application/json` — POST / PATCH / PUT bodies
 *     are JSON. GitHub doesn't accept form-encoded for these
 *     surfaces.
 *
 * Body handling:
 *   - GET / DELETE: no body. Query params via `URLSearchParams` in
 *     the optional `query` field.
 *   - POST / PATCH / PUT: the `body` object is JSON-stringified
 *     verbatim. `null` / `undefined` field values are dropped at the
 *     wrapper layer (per-resource files).
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by `refreshAndRetry`).
 *     For GitHub (non-refreshable per Slice 14b Commit 2), this
 *     surfaces as `IntegrationActionRequiredError(reason:
 *     "refresh_not_supported")` — the user's prompt is "reconnect
 *     your GitHub account."
 *   - 404 → `NotFoundError(resource)` so handlers can give a stable
 *     "not found" UX. Used by `create_pull_request`'s default-branch
 *     auto-detect to surface "repo not found" cleanly.
 *   - 422 → `ValidationError(resource, detail)`. GitHub's "Validation
 *     Failed" status — returned for "branch already exists", missing
 *     required fields, etc. Distinct class so handlers can recover
 *     vs propagate.
 *   - Other non-OK → generic `Error("GitHub <method> <path> failed:
 *     <message>")`. The GitHub error envelope's `message` + `errors[]`
 *     fields are extracted via `surfaceGitHubError`.
 */

export interface GitHubRequestInput {
  /** Decrypted GitHub access token from the integration row. */
  accessToken: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /**
   * Path relative to the GitHub REST API base. MUST start with a
   * leading slash. Examples: `/repos/octocat/hello/issues`,
   * `/user/repos`, `/gists`.
   */
  path: string;
  /** Optional query parameters appended to the URL. */
  query?: URLSearchParams;
  /**
   * Optional JSON body object. Stringified verbatim — drop nulls /
   * undefineds at the wrapper layer if needed. Pass `undefined` for
   * GET / DELETE / endpoints that take no body.
   */
  body?: Readonly<Record<string, unknown> | readonly unknown[]>;
  /**
   * Resource label for `NotFoundError` / `ValidationError`. Pass a
   * stable, user-meaningful string like `"issue 42"`,
   * `"branch refs/heads/feature"`, `"repository octocat/hello"`.
   */
  resourceForNotFound: string;
}

export async function githubRequest<T>(
  input: GitHubRequestInput,
): Promise<T> {
  const queryString = input.query ? input.query.toString() : "";
  const url = `${githubApiBase()}${input.path}${queryString ? `?${queryString}` : ""}`;

  const headers: Record<string, string> = {
    Authorization: `token ${input.accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };

  let bodyString: string | undefined;
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyString = JSON.stringify(input.body);
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: bodyString,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `GitHub ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceGitHubError(text, 404),
    );
  }
  if (res.status === 422) {
    const text = await res.text().catch(() => "");
    throw new ValidationError(
      input.resourceForNotFound,
      surfaceGitHubError(text, 422),
    );
  }
  if (res.status === 204) {
    // No content — handler chose a void return shape. JSON.parse
    // would fail on the empty body. Treat as `{}`.
    return {} as T;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GitHub ${input.method} ${input.path} failed: ${surfaceGitHubError(text, res.status)}`,
    );
  }

  // GitHub's REST surface always returns JSON on 2xx with content.
  return (await res.json()) as T;
}
