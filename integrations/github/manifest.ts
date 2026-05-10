import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * GitHub provider manifest.
 *
 * Slice 14b — V2's developer-tools provider. See
 * `docs/slices/slice-14b-github.md` §"OAuth model" and §"Confirmed
 * scope decisions". Parallel-track slice to Mailchimp (slice-14);
 * keep edits to shared infrastructure files (`_registry.ts`,
 * `dispatcher.ts`) append-only to avoid merge conflicts.
 *
 * Capability flags follow V2's honest-state convention. Slice 14b
 * Commit 2 (this) lands manifest + OAuth + dispatcher registration —
 * `oauth: true`, the rest `false`. Subsequent commits flip `actions`
 * (Commit 3 — 6 handlers) and `webhookTrigger` (Commit 4 — single
 * `new_commit` trigger).
 *
 * Token model — non-refreshable OAuth App tokens:
 *   GitHub OAuth Apps (the model V1 uses) issue non-expiring access
 *   tokens with NO refresh grant. The token endpoint response carries
 *   `{ access_token, token_type, scope }` only — no `refresh_token`,
 *   no `expires_in`. The only end-state for a token is user-side
 *   revocation from
 *   `github.com/settings/applications`. On 401 the per-provider
 *   `refreshToken()` throws `RefreshNotSupportedError` — matches
 *   V2's Slack / Notion / Shopify non-refreshable contract.
 *
 *   This is distinct from **GitHub Apps** (a different product) with
 *   user-to-server tokens, which DO refresh. V1 does not use GitHub
 *   Apps; V2 stays on the OAuth App model. V1's
 *   [`authSchemes.ts:83`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L83)
 *   confirms `'non_refreshable'`. V1's `oauthConfig.ts` declares
 *   `refreshTokenExpirationSupported: true` but that's dead config —
 *   the auth-scheme registry is authoritative. V2 does NOT replicate
 *   the dead config.
 *
 * `tokenScope: "user"` — one GitHub integration per (user, login).
 * Re-authorizing as a different GitHub user creates a sibling
 * integration row.
 *
 * `accountIdField: "login"` — GitHub's `GET /user` returns the
 * authenticated user's `login` (e.g. `"octocat"`). Stable for the
 * life of the account; uniquely identifies the GitHub user the
 * access token belongs to. The auxiliary `/user` call happens once
 * during OAuth callback to populate this — there's no
 * single-token-response shortcut like Stripe's `stripe_user_id`.
 *
 * `apiVersion: "2022-11-28"` — pinned via the
 * `X-GitHub-Api-Version` header on every REST call (Slice 14b Commit
 * 3 + Commit 4 lifecycle). Mirrors V1's
 * [`GitHubTriggerLifecycle.ts:95`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/GitHubTriggerLifecycle.ts#L95)
 * and V1 actions
 * ([`github.ts:71`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L71)).
 *
 * `healthCheckIntervalMs: 4h` — mid-tier between Google/Microsoft
 * (6h) and "other" (12h). Matches Slack's tier (developer-tools
 * providers where token-revocation surfacing benefits from a tighter
 * cadence). Slice 14b doesn't ship the health-check route — manifest
 * declares the cadence so the future health-engine cron picks it up.
 *
 * `scopes.required: 3 scopes` — covers every action and trigger in
 * Slice 14b Batch 1, all required (no optional, no deprecated). V1's
 * scope split (`repo` required; `read:org`, `gist` optional) is
 * intentionally collapsed: every Batch 1 action needs these in
 * practice (any org-owned repository operation needs `read:org`;
 * `create_gist` needs `gist`), so making them all required surfaces
 * a single consent prompt rather than a sequence of "needs more
 * permissions" reconnects. The `repo` scope already grants
 * webhook-management permissions per current GitHub docs — V2 does
 * NOT request `admin:repo_hook` separately.
 *
 * `oauthFlows: ["v2"]` — GitHub's current OAuth 2.0 flow. The "OAuth
 * App vs GitHub App" distinction is product-level — V2 stays on
 * OAuth App (the model V1 uses).
 *
 * No PKCE — GitHub's authorize endpoint at
 * `https://github.com/login/oauth/authorize` doesn't require or
 * accept `code_challenge` / `code_challenge_method` parameters. The
 * per-provider OAuth omits `generatePkce()`; the dispatcher passes
 * `null` to `buildAuthUrl` and `handleCallback`.
 *
 * `refreshable: false` — GitHub OAuth App tokens don't expire and
 * don't have a refresh grant. V2's first body-auth +
 * non-refreshable provider (Slack is form-encoded with workspace
 * scope, Notion is Basic-auth + workspace, Shopify is per-tenant,
 * Stripe is body-auth + refreshable — GitHub fills the
 * body-auth+non-refreshable+user-scope cell).
 */
export const githubManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "github",
  displayName: "GitHub",
  isEnabled: true,
  apiVersion: "2022-11-28",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "login",
  scopes: {
    required: ["repo", "read:org", "gist"],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    // Flips true in Slice 14b Commit 4 — single `new_commit` trigger
    // for `push` events with per-repository webhook lifecycle. Webhook
    // route at /api/webhooks/github. NO renewal handler — GitHub repo
    // webhooks don't expire.
    webhookTrigger: false,
    pollingTrigger: false,
    // Flips true in Slice 14b Commit 3 — 6 action handlers
    // (create_issue, create_repository, create_pull_request,
    // create_branch, create_gist, add_comment) registered in
    // services/execution/handlers/_registry.ts. REST-only via
    // _shared/github/api wrappers; principal calls wrapped in
    // refreshAndRetry. Because GitHub is non-refreshable, 401s
    // surface as IntegrationActionRequiredError(reason:
    // "refresh_not_supported") with no refresh attempt — same shape
    // as Slack / Notion / Shopify.
    actions: false,
  },
  healthCheckIntervalMs: 4 * 60 * 60 * 1000, // 4h
  refreshable: false,
});
