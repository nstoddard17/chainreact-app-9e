import { githubRequest } from "./_request";

/**
 * GitHub REST `/repos/{owner}/{repo}/hooks` resource wrappers —
 * Slice 14b Commit 4.
 *
 * Used by the `new_commit` trigger's activate / deactivate hooks to
 * manage per-repository webhook subscriptions.
 *
 * **Per-repository, per-workflow.** Unlike HubSpot's app-level shared
 * subscriptions (Slice 13), GitHub creates ONE webhook resource per
 * (workflow, node, repository). The `repo` OAuth scope grants
 * webhook-management permissions per current GitHub docs — V2
 * doesn't request the separate `admin:repo_hook` scope.
 *
 * **Auth: user's OAuth App access token** (NOT a global app secret).
 * GitHub OAuth App webhooks are scoped to the user that authorized
 * them; the access token is the auth principal for both the create
 * call and the delete call.
 *
 * **No expiration.** GitHub repo webhooks live until explicit
 * deletion (`repoHooksDelete`) or until the user uninstalls the
 * OAuth App. The trigger registers no renewal handler — see
 * `triggers/newCommit/index.ts`.
 */

// ─── Wire-format response ───────────────────────────────────────────────────

/**
 * GitHub repo-hook resource shape (per current docs +
 * cross-checked against V1's
 * [`GitHubTriggerLifecycle.ts:116`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/GitHubTriggerLifecycle.ts#L116)
 * create-response handling).
 */
export interface GitHubRepoHook {
  id: number;
  type?: string;
  name?: string;
  active?: boolean;
  events?: string[];
  config?: {
    url?: string;
    content_type?: string;
    insecure_ssl?: string;
    secret?: string;
  };
  url?: string;
  test_url?: string;
  ping_url?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── repoHooksCreate ────────────────────────────────────────────────────────

export interface RepoHooksCreateInput {
  /** OAuth App access token for the GitHub user owning this integration. */
  accessToken: string;
  owner: string;
  repo: string;
  /**
   * Notification URL. Includes `?workflowId=X&nodeId=Y` query params
   * for the receive route's strict-direct-lookup (mirrors
   * Shopify/Stripe).
   */
  url: string;
  /**
   * Webhook secret used for HMAC signature. Stored on GitHub's side;
   * GitHub HMAC-SHA256s every delivery body keyed with this value
   * and sends it in `X-Hub-Signature-256`. V2 uses the global
   * `GITHUB_WEBHOOK_SECRET` env (same value for every workflow's
   * webhook so the receive route can verify with one secret).
   */
  secret: string;
  /**
   * Event names to subscribe to. Slice 14b Batch 1 ships `["push"]`
   * only; future slices may add more.
   */
  events: readonly string[];
  /** Default true — the activate hook always passes true. */
  active?: boolean;
}

export async function repoHooksCreate(
  input: RepoHooksCreateInput,
): Promise<GitHubRepoHook> {
  const body: Record<string, unknown> = {
    name: "web",
    active: input.active ?? true,
    events: input.events,
    config: {
      url: input.url,
      content_type: "json",
      secret: input.secret,
      insecure_ssl: "0",
    },
  };
  return githubRequest<GitHubRepoHook>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/hooks`,
    body,
    resourceForNotFound: `webhook (create) on ${input.owner}/${input.repo}`,
  });
}

// ─── repoHooksDelete ────────────────────────────────────────────────────────

export interface RepoHooksDeleteInput {
  accessToken: string;
  owner: string;
  repo: string;
  /** GitHub webhook id from a prior create response. */
  hookId: number;
}

export async function repoHooksDelete(
  input: RepoHooksDeleteInput,
): Promise<void> {
  await githubRequest<unknown>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/hooks/${input.hookId}`,
    resourceForNotFound: `webhook ${input.hookId} on ${input.owner}/${input.repo}`,
  });
  // GitHub returns 204 No Content on successful delete. The shared
  // `_request.ts` wrapper turns 204 into `{}`; we ignore the body.
}
