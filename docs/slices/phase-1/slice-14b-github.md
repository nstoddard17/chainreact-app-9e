# Slice 14b — **GitHub** provider port

**Branch:** `slice-14b-github` (off `slice-13-hubspot`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port GitHub from V1 as a small, clean parallel slice while another chat builds Mailchimp. Ships an OAuth dispatcher entry (header-auth, **non-refreshable**, no PKCE), 6 typed action handlers covering core developer-automation primitives (issues / PRs / repos / branches / gists / comments), and a single per-repository webhook trigger (`new_commit`) with `X-Hub-Signature-256` HMAC-SHA256 verification and `X-GitHub-Delivery` dedup. Closes two real V1 security gaps (silent unsigned-webhook acceptance + dev-mode signature bypass) during the port.

GitHub is the parallel-track slice to Mailchimp because it is **structurally smaller and structurally cleaner**: V1's GitHub code is monolithic but well-shaped (one actions file, one lifecycle file, one webhook route), webhooks are per-repository (no shared-subscription primitive needed), the signature scheme is a vanilla HMAC over raw body (no canonical-string-of-elements like HubSpot), and OAuth is non-refreshable (matches V2's existing Slack / Notion / Shopify contract). Slice 14b should not require touching the same shared infrastructure files Mailchimp will (`_registry.ts` order, dispatcher entry order) beyond two append-only adds.

---

## V1 audit — paths and findings

### Manifest / node definitions

- Single manifest file: [`lib/workflows/nodes/providers/github/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/github/index.ts) (lines 1-403). Declares **6 actions + 1 trigger** inline.
- Triggers: `github_trigger_new_commit` (push events only).
- Actions: `github_action_create_issue`, `github_action_create_repository`, `github_action_create_pull_request`, `github_action_create_branch`, `github_action_create_gist`, `github_action_add_comment`.

### Action handlers

- Single file: [`lib/workflows/actions/github.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts) (651 lines). All handlers use `Authorization: token ${accessToken}` (GitHub's idiomatic header — NOT `Bearer`).
- Endpoints:
  - `createGitHubIssue` ([line 11](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L11)) — `POST /repos/{owner}/{repo}/issues`.
  - `createGitHubRepository` ([line 114](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L114)) — `POST /user/repos`.
  - `createGitHubPullRequest` ([line 221](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L221)) — `POST /repos/{owner}/{repo}/pulls`. **Implements PR-G6 default-branch auto-detect** ([lines 266-302](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L266)): when `base` is empty/missing, GET `/repos/{owner}/{repo}`, read `default_branch`. On any failure, return `success:false, category:'provider'` rather than fall back to literal `'main'` (which guesses wrong on master / develop / trunk repos).
  - `createGitHubGist` ([line 362](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L362)) — `POST /gists`.
  - `createGitHubBranch` ([line 454](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L454)) — `GET /repos/{owner}/{repo}/git/ref/heads/{sourceBranch}` then `POST /repos/{owner}/{repo}/git/refs`. Source branch defaults to literal `'main'` ([line 465](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L465)) — this is the same `'main'`-guess rot PR-G6 fixed for PRs but never extended to branch creation. **V2 fixes this during port** (see "V1 rot to fix" §4 below).
  - `addGitHubComment` ([line 565](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L565)) — `POST /repos/{owner}/{repo}/issues/{issueNumber}/comments`.
- No idempotency keys (GitHub has no equivalent of Stripe's `Idempotency-Key`).
- 401 handling — ad-hoc per handler. V2 wraps every action's principal call in `refreshAndRetry`. Because GitHub is non-refreshable, the wrapper's first 401 surfaces directly as `IntegrationActionRequiredError(reason: "refresh_not_supported")` with no refresh attempt — same shape as Slack / Notion / Shopify.

### Triggers / webhooks

**Lifecycle:** [`lib/triggers/providers/GitHubTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/GitHubTriggerLifecycle.ts) (245 lines).

- Webhook-only (no polling). Per-repository hooks. Activation hits `POST /repos/{owner}/{repo}/hooks` ([line 87-108](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/GitHubTriggerLifecycle.ts#L87)) with `{ name: 'web', active: true, events: ['push'], config: { url, content_type: 'json', secret, insecure_ssl: '0' } }`.
- Stores webhook id in `trigger_resources.external_id` ([line 132](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/GitHubTriggerLifecycle.ts#L132)).
- Activation auth uses `Authorization: Bearer ${token}` ([line 92](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/GitHubTriggerLifecycle.ts#L92)) — **inconsistent with action handlers** which use `token ${token}`. Both work against the GitHub REST API in practice, but the convention is `token` for OAuth App tokens. **V2 standardizes to `token` everywhere**.
- Deactivation hits `DELETE /repos/{owner}/{repo}/hooks/{webhookId}` ([line 201-216](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/GitHubTriggerLifecycle.ts#L201)). Treats `404` as success (idempotent — already deleted).

**Receive route:** [`app/api/webhooks/github/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts) (186 lines).

- Reads `X-Hub-Signature-256` ([line 62](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L62)). Format: `sha256=<hex>`. HMAC-SHA256 over the raw body, hex-encoded, keyed with `GITHUB_WEBHOOK_SECRET || GITHUB_CLIENT_SECRET` ([line 25](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L25)).
- Constant-time compare via `crypto.timingSafeEqual` ([line 40](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L40)).
- **Two real V1 security gaps:**
  1. `if (!secret) return true` ([line 26-28](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L26)) — silently accepts unsigned webhooks when env var is missing.
  2. `if (!signatureHeader) return true` ([line 31-34](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L31)) — explicitly comments "Allow in development" but the route is shared with production. Crafted requests with no signature header bypass verification.
- Reads `X-GitHub-Event` to map to trigger type ([line 68-79](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L68)). Currently only `push → github_trigger_new_commit`. Other events (`ping`, etc.) are accepted with 200 but not dispatched.
- Reads `X-GitHub-Delivery` and passes downstream as `dedupeKey` ([line 170](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L170)) — V2 mirrors this as the canonical dedup field.

### OAuth flow

- Config: [`lib/integrations/oauthConfig.ts:149-163`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L149).
  - `authEndpoint: "https://github.com/login/oauth/authorize"`.
  - `tokenEndpoint: "https://github.com/login/oauth/access_token"`.
  - `authMethod: "body"` — `client_id` + `client_secret` go in form body, NOT a Basic header.
  - Has `refreshTokenExpirationSupported: true` and `refreshTokenExpiryBuffer: 60` declared, but these are **dead config** — V1's [`authSchemes.ts:83`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L83) marks GitHub as `'non_refreshable'`. V1 uses **GitHub OAuth Apps**, which issue non-expiring access tokens with no refresh grant. V2 does NOT replicate the dead config — manifest is `refreshable: false`, `refreshToken()` throws `RefreshNotSupportedError("github")`.
  - **No PKCE.** GitHub's authorize endpoint accepts no `code_challenge` — V2 omits `generatePkce()`.
- Scopes: [`lib/integrations/integrationScopes.ts:13-16`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/integrationScopes.ts#L13). Required `repo`. Optional `read:org`, `gist`. Slice 14b's manifest pulls all three into `scopes.required` — `gist` is required for the `create_gist` action; `read:org` is required for organization-owned repository operations (PR / branch / issue against an org repo).
- Token-exchange response: `{ access_token, token_type: "bearer", scope: "repo,gist,read:org" }`. **No `refresh_token`, no `expires_in`** — confirms non-refreshable model.
- Account-id resolution: V1 uses GitHub's `GET /user` endpoint (sourced from inline lookups elsewhere). V2 makes one auxiliary `GET /user` call after token exchange to populate `providerAccountId = login` (the GitHub username — stable for the life of the account) and `displayName = name || login`.

### Tests

- One test file in V1: [`__tests__/workflows/pr-g6-github-default-branch-autodetect.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/workflows/pr-g6-github-default-branch-autodetect.test.ts) (225 lines). Covers PR-G6 logic for `create_pull_request`. V2 ports the spirit of these (auto-detect, no `'main'` fallback, fail-closed on lookup error).
- ZERO action-handler tests, ZERO OAuth tests, ZERO lifecycle tests, ZERO webhook signature tests. Slice 14b adds all four classes during the port.

---

## OAuth model — non-refreshable + body-auth + no PKCE

1. **Provider id — `github`.** Standard V2 provider folder (`integrations/github/`) + dispatcher entry. One GitHub integration per (user, login).
2. **Non-refreshable.** Manifest: `refreshable: false`. Per-provider `refreshToken()` throws `RefreshNotSupportedError("github")` — same shape as Slack / Notion / Shopify. `refreshAndRetry` translates to `IntegrationActionRequiredError(reason: "refresh_not_supported")` so 401s prompt "reconnect your GitHub account" rather than retry-loop.
3. **Body-auth.** Token exchange: POST `https://github.com/login/oauth/access_token` with `Content-Type: application/x-www-form-urlencoded` body `grant_type=authorization_code&code=…&client_id=…&client_secret=…&redirect_uri=…`. Response is form-encoded by default but the `Accept: application/json` header on the request elicits JSON. V2 sends `Accept: application/json`.
4. **No PKCE.** Authorize URL: GET `https://github.com/login/oauth/authorize?client_id=…&scope=…&redirect_uri=…&state=…`. Scopes are **space-separated** (GitHub convention). The per-provider OAuth omits `generatePkce()`; the dispatcher passes `null` to `buildAuthUrl` and `handleCallback`.
5. **Scopes — 3 required (no optional, no deprecated).** `repo` covers issues / PRs / branches / repository creation / commit reads. `gist` is required for `create_gist`. `read:org` is required for organization-scoped repository operations (any owner that isn't the authenticated user). All three are mandatory because Slice 14b ships actions that touch all three permission surfaces.
6. **Account id — `login`.** After token exchange, V2 calls `GET https://api.github.com/user` with `Authorization: token ${access_token}` and `Accept: application/vnd.github+json`. The response's `login` (e.g. `"octocat"`) becomes `providerAccountId`; `name || login` becomes `displayName`. Avatar URL stored in `metadata.avatarUrl` for connection-management UI.
7. **`tokenScope: "user"`.** One GitHub integration per (user, login). Re-authorizing as a different GitHub user creates a sibling integration row.
8. **Token storage.** Access token AES-256-GCM encrypted on `integrations.access_token_encrypted`. `refresh_token_encrypted = null`. `accessTokenExpiresAt = null` (GitHub OAuth App tokens don't expire).
9. **Health check interval — 4h.** Mid-tier between Google/Microsoft (6h) and "other" (12h). GitHub APIs are gentle on rate limits but token revocation surfaces faster with a tighter cadence; aligns with V2's other "developer tools" tier.
10. **`apiVersion: "2022-11-28"`** — pinned via the `X-GitHub-Api-Version` header on every REST call. Mirrors V1's lifecycle ([`GitHubTriggerLifecycle.ts:95`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/GitHubTriggerLifecycle.ts#L95)).

---

## Action subset — final list (V1-derived, deviates from approved-shape "expected" list)

The approved shape mentioned `get_pull_request`, `list_pull_requests`, `merge_pull_request`, `create_comment` as "expected from V1/audit". **The V1 audit confirms these do NOT exist in V1.** V1 ships exactly 6 GitHub actions; Slice 14b ports those 6 1:1, applies the PR-G6 default-branch fix consistently across both `create_pull_request` AND `create_branch`, and defers PR get/list/merge to a future slice. Reporting this divergence here per the slice's "Confirm final list in Commit 1" rule.

### Final V2 action surface — 6 typed handlers

| V2 action | V1 source | Endpoint | Required fields | Notes |
|---|---|---|---|---|
| `create_issue` | [github.ts:11-112](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L11) | `POST /repos/{owner}/{repo}/issues` | `repository` (`owner/repo`), `title` | Optional: `body`, `labels[]`, `assignees[]`, `milestone`. |
| `create_repository` | [github.ts:114-219](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L114) | `POST /user/repos` | `name` | Optional: `description`, `private`, `auto_init`, `gitignore_template`, `license_template`. |
| `create_pull_request` | [github.ts:221-360](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L221) | `POST /repos/{owner}/{repo}/pulls` | `repository`, `title`, `head` | `base` optional — PR-G6 auto-detects via `GET /repos/{owner}/{repo}` → `default_branch`. Fail-closed on lookup error (`success:false, category:'provider'`). Optional: `body`, `draft`. |
| `create_branch` | [github.ts:454-563](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L454) | `POST /repos/{owner}/{repo}/git/refs` | `repository`, `branchName` | `sourceBranch` optional — V2 fixes V1 rot by applying PR-G6 default-branch auto-detect (V1 hard-defaulted to `'main'`). Then `GET /repos/{owner}/{repo}/git/ref/heads/{effectiveSource}` for the SHA, then `POST` the ref. |
| `create_gist` | [github.ts:362-452](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L362) | `POST /gists` | `filename`, `content` | Optional: `description`, `isPublic`. |
| `add_comment` | [github.ts:565-650](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L565) | `POST /repos/{owner}/{repo}/issues/{issueNumber}/comments` | `repository`, `issueNumber`, `body` | Comments work on both issues and PRs (PRs are issues from the API's POV). |

Every handler:
- Uses `Authorization: token ${accessToken}` (V2's standardization — V1's lifecycle inconsistency is fixed).
- Sends `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28`.
- Wraps the principal outbound write call in `refreshAndRetry` — 401s surface as `IntegrationActionRequiredError(reason: "refresh_not_supported")`.
- Uses Zod schemas for input validation (strict shape — extra fields rejected).
- Returns useful downstream variables: numeric ids, urls, branch refs, gist ids, etc.

**Deferred to future slice:** `get_pull_request`, `list_pull_requests`, `merge_pull_request`, `update_issue`, `close_issue`, `create_release`, `add_label`, `assign_user`, Checks API, Actions API, Projects API, GitHub Apps installation flow.

---

## Webhook model — single trigger, per-repo lifecycle

1. **One trigger — `new_commit`** (V2 trigger type id; V1 named it `github_trigger_new_commit`). Listens for GitHub `push` events. **Not consolidated into a `webhook_received` discriminator** because V1 already only ships one event type and the slice prompt explicitly notes "one consolidated push_received or webhook_received trigger depending on V1 semantics." Going with `new_commit` keeps the V1 trigger contract intact and matches the existing user-facing trigger name; a future slice that adds `pull_request_opened` / `pull_request_merged` / `release_published` triggers will introduce the consolidated `webhook_received` shape if the surface grows.
2. **Trigger config** — `repository` (required, `owner/repo`), `branch` (optional — receive route filters by branch when set; absent means all branches).
3. **Per-repository webhook lifecycle.** Activation:
   - `POST /repos/{owner}/{repo}/hooks` with body `{ name: 'web', active: true, events: ['push'], config: { url, content_type: 'json', secret: GITHUB_WEBHOOK_SECRET, insecure_ssl: '0' } }`.
   - Auth: `Authorization: token ${accessToken}` (V2 standardization fixes V1's `Bearer` inconsistency).
   - Stores webhook id in `trigger_resources.external_id`.
   - One webhook per (workflow, node, repository).
4. **Deactivation:** `DELETE /repos/{owner}/{repo}/hooks/{webhookId}`. 404 treated as success (already deleted).
5. **No expiration** — GitHub repo webhooks don't expire. `subscriptionRegistry` does NOT register a renewal handler for GitHub.
6. **No shared subscriptions** — unlike HubSpot's app-level model, GitHub creates one webhook per repo per workflow. No reference counting, no new tables.

---

## Signature verification model — HMAC-SHA256-hex over raw body

1. **Header — `X-Hub-Signature-256`.** Format: `sha256=<hex>`. (GitHub also sends `X-Hub-Signature` — older SHA-1 variant. V2 verifies the SHA-256 only.)
2. **Algorithm — HMAC-SHA256 over the raw request body bytes.** Receive route MUST capture the raw body BEFORE any JSON parsing. Re-serializing alters whitespace and breaks the digest.
3. **Key — `GITHUB_WEBHOOK_SECRET`.** Single global app secret, stored as env var. **Distinct from `GITHUB_CLIENT_SECRET`** — V2 requires a separate webhook secret rather than V1's `GITHUB_WEBHOOK_SECRET || GITHUB_CLIENT_SECRET` fallback. Reusing the OAuth client secret as a webhook secret is a defense-in-depth anti-pattern (a leak of one compromises both halves of the auth surface).
4. **Compare — constant-time** via `crypto.timingSafeEqual`. Length-mismatch guard runs BEFORE `timingSafeEqual` (which throws on different-length buffers) — typed result `{ valid: false, reason: "malformed" }` on length mismatch.
5. **Module location:** `_shared/github/webhooks/signature.ts`. Mirrors `_shared/shopify/webhooks/signature.ts` shape: raw body in, header in, secret in, typed result `{ valid: true } | { valid: false; reason: "missing_header" | "malformed" | "mismatch" | "missing_secret" }` out.
6. **Closes V1 security gaps:**
   - V1 returns `true` (allows) when `secret` env var is missing. **V2 returns `{ valid: false, reason: "missing_secret" }`** which the receive route maps to a 503 (server misconfig) — never a silent accept.
   - V1 returns `true` when `signatureHeader` is null. **V2 returns `{ valid: false, reason: "missing_header" }`** which maps to a 401.
7. **Replay window — none.** GitHub doesn't ship a timestamp header; replay protection comes via dedup on `X-GitHub-Delivery` (next §).

---

## Dedup key strategy — `X-GitHub-Delivery`

1. **Source:** `X-GitHub-Delivery` header on every webhook delivery. UUID per delivery attempt.
2. **Store:** V2's `webhook_event_dedup` table keyed on `(provider='github', deliveryId)`.
3. **Routing in receive route:**
   1. Capture raw body BEFORE JSON parse.
   2. Read `X-Hub-Signature-256` and `X-GitHub-Event` and `X-GitHub-Delivery` headers.
   3. Verify signature against `GITHUB_WEBHOOK_SECRET`. Reject 401 on `missing_header` / `malformed` / `mismatch`. Reject 503 on `missing_secret`.
   4. Handle `ping` event with 200 + `{ ok: true, message: "pong" }` (GitHub's first-delivery handshake — must succeed for the webhook to register as healthy in the GitHub UI).
   5. Map `X-GitHub-Event` to V2 trigger type — only `push → new_commit` in Batch 1; other events 200-ack-and-skip with `{ ok: true, message: "event not handled" }`.
   6. Parse body. Look up matching `trigger_resources` rows: `provider='github' AND trigger_type='new_commit' AND status='active'`, filtered by `config.repository == payload.repository.full_name` AND (`config.branch` absent OR `config.branch == ref-stripped-of-refs/heads/`).
   7. For each matching workflow: dedup by `(provider, deliveryId)` against `webhook_event_dedup`; on first-seen, dispatch as `TriggerEvent` and record the dedup row.
   8. Return 200 with `{ ok: true, dispatched: N }`.

---

## V1 bugs to fix during port

1. **Silent unsigned-webhook accept.** [`route.ts:26-28`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L26) returns `true` when `GITHUB_WEBHOOK_SECRET` is missing. **V2 fix:** typed `{ valid: false, reason: "missing_secret" }` → 503.
2. **Missing-signature-header dev bypass.** [`route.ts:31-34`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L31) returns `true` when `signatureHeader` is null. **V2 fix:** `{ valid: false, reason: "missing_header" }` → 401.
3. **Webhook-secret reused from OAuth client secret.** V1's `process.env.GITHUB_WEBHOOK_SECRET || process.env.GITHUB_CLIENT_SECRET` ([`route.ts:25`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L25)) defense-in-depth-violation. **V2 fix:** require `GITHUB_WEBHOOK_SECRET` as its own env var; `GITHUB_CLIENT_SECRET` is OAuth-only.
4. **`createGitHubBranch` hardcodes `'main'` default for source branch** ([github.ts:465](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L465)). Same `'main'`-guess rot PR-G6 fixed for PRs. **V2 fix:** apply PR-G6 default-branch auto-detect in `create_branch` — when `sourceBranch` is empty/missing, GET `/repos/{owner}/{repo}` → `default_branch`. Fail-closed on lookup error (`success:false, category:'provider'`), don't fall back to `'main'`.
5. **Bearer/token auth header inconsistency.** V1 lifecycle uses `Bearer` ([line 92](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/GitHubTriggerLifecycle.ts#L92)) but V1 actions use `token`. Both work, but `token` is GitHub's documented convention for OAuth App tokens. **V2 fix:** standardize to `token` everywhere, including the lifecycle activate/deactivate calls.
6. **Dead `refreshTokenExpirationSupported: true` config.** [`oauthConfig.ts:155-159`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L155) declares refresh-related fields that contradict `authSchemes.ts:83`'s `'non_refreshable'`. **V2 doesn't replicate** — manifest is `refreshable: false`, no refresh-buffer config.

---

## V1 patterns to skip

1. **Personal Access Token (PAT) flow.** V1's `authSchemes.ts:19` notes "GitHub PAT" as a non-refreshable scheme. V2 ships OAuth App only — no PAT auth path. PAT support is a future slice if needed.
2. **GitHub Apps (user-to-server tokens).** V1 uses GitHub OAuth Apps (non-refreshable). GitHub Apps with user-to-server tokens DO refresh, but V1 doesn't use them — V2 stays on the OAuth App model that V1 ships.
3. **Repo-scoped permissions UI.** V1 has no separate scope-toggle UI; scopes are declared once in the manifest and granted at install. V2 keeps the same — no per-action permissions checking; `repo` covers everything in Batch 1.
4. **Checks API / Actions API / Projects API.** Out of scope for Batch 1.
5. **Older `X-Hub-Signature` (SHA-1) verification.** V1 only verifies the SHA-256 variant. V2 same — SHA-1 is deprecated.
6. **Inline `executeWebhookWorkflow`-from-route call shape.** V2's receive route calls into V2's webhook executor (`services/triggers/dispatch.ts` or equivalent) with the `TriggerEvent` shape, NOT V1's `executeWebhookWorkflow({ workflowId, userId, ...})`-per-row pattern. The receive route iterates resolved workflows and emits one `TriggerEvent` per match — the dispatcher handles the rest.

---

## External setup checklist

To run Slice 14b's e2e against real GitHub (optional — mock server owns the boundary for the test suite):

1. **GitHub OAuth App** at `github.com/settings/developers → OAuth Apps → New OAuth App` (free; one-click setup).
2. **App settings:**
   - **Homepage URL:** `${NEXT_PUBLIC_APP_URL}` (or your dev URL).
   - **Authorization callback URL:** `${NEXT_PUBLIC_APP_URL}/api/integrations/oauth/github/callback`.
   - **Webhook URL** (configured per-repo at activation, NOT in the OAuth App settings): each `trigger_resources` row's lifecycle calls `POST /repos/{owner}/{repo}/hooks` with `config.url = ${NEXT_PUBLIC_APP_URL}/api/webhooks/github` + `config.secret = GITHUB_WEBHOOK_SECRET`.
3. **Env vars** (for the V2 dev server):
   - `GITHUB_CLIENT_ID` — from OAuth App settings.
   - `GITHUB_CLIENT_SECRET` — from OAuth App settings (OAuth token-exchange ONLY).
   - `GITHUB_WEBHOOK_SECRET` — distinct value used by lifecycle to register webhooks AND by receive route to verify signatures. Generate with `openssl rand -hex 32`. **Do NOT reuse `GITHUB_CLIENT_SECRET`** — V2 requires this to be its own env var.
4. **For e2e:** none of the above is required. The mocked Playwright suite ships throwaway values via `playwright.config.ts` `webServer.env` and the mock server validates them shape-only.

---

## Five-commit shape

| Commit | Scope |
|---|---|
| **1. `docs: slice 14b github plan`** | THIS DOC. |
| 2. `feat(github): manifest + OAuth + dispatcher registration` | `integrations/github/manifest.ts`, `integrations/github/oauth.ts` (non-refreshable, body-auth, no-PKCE; `refreshToken` throws `RefreshNotSupportedError("github")`), dispatcher entry, `_shared/github/api/_base.ts` (constants + `Accept` / `X-GitHub-Api-Version` headers). Capabilities: `oauth: true`, all others `false`. Unit tests cover OAuth + scope joining (space-separated) + `login` resolution from `GET /user`. |
| 3. `feat(github): actions Batch 1 — issues + PRs + repos + branches + gists + comments` | 6 typed handlers + Zod schemas. `_shared/github/api/_request.ts` (Bearer-token-style auth via `Authorization: token ${token}` header, JSON body, `refreshAndRetry`-wrapped). `_shared/github/errors.ts`. **PR-G6 default-branch helper extended to both `create_pull_request` and `create_branch`** — single `_shared/github/api/repos.ts` `getDefaultBranch(token, owner, repo)` helper used by both. `capabilities.actions: true`. Handler-registry entries appended to `services/execution/handlers/_registry.ts`. |
| 4. `feat(github): new_commit trigger + X-Hub-Signature-256 verification + per-repo lifecycle` | `_shared/github/webhooks/signature.ts` (HMAC-SHA256-hex verify with typed-result + length-mismatch guard + missing-secret/missing-header distinct reasons). `integrations/github/triggers/newCommit/{activate,deactivate,receive,index}.ts` per V2 convention. Receive route at `/api/webhooks/github`. Routing by `payload.repository.full_name` + optional `branch`-filter. Dedup by `X-GitHub-Delivery`. NO renewal handler (GitHub repo webhooks don't expire). `capabilities.webhookTrigger: true`. |
| 5. `test(e2e): add GitHub walkthrough with mocked GitHub boundary` | `tests/e2e/helpers/mockGitHubServer.ts` (port TBD — likely 9884 to match the slice numbering). `tests/e2e/slice-14b-github-walkthrough.spec.ts`. Asserts: OAuth state consumed → token encrypted, `GET /user` resolves login → integration row stores it, action call works (`create_issue` and `create_pull_request` covering PR-G6 auto-detect path), webhook lifecycle creates per-repo hook on activation and deletes on deactivation, signed `push` event dispatches workflow, invalid signature → 401, missing signature header → 401, missing secret → 503, duplicate `X-GitHub-Delivery` deduped on second arrival, full workflow run succeeds end-to-end. |

---

## Validation gates (per commit)

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

For final e2e commit (Commit 5), run all 13 existing provider walkthroughs in order + Slice 14b twice for stability.

---

## Stop-and-report rules (per CLAUDE.md)

- **Only deviates from approved-shape plan in one place** — the action surface is V1's actual 6 actions, not the prompt's mentioned `get_pull_request` / `list_pull_requests` / `merge_pull_request` / `create_comment`. Reported above with full V1 file paths and line numbers.
- **No new tables, no new migrations.** Per-repo webhook lifecycle reuses `trigger_resources` (same shape Stripe / Shopify / Slack already use). Webhook dedup reuses `webhook_event_dedup` (same table Stripe / Shopify / Airtable use).
- **Two append-only edits to shared infrastructure files** — `integrations/_registry.ts` (manifest import + side-effect trigger import) and `services/oauth/dispatcher.ts` (one OAuth entry). Designed not to conflict with parallel Mailchimp work.
- **Keep slice intentionally bounded** — Checks / Actions / Projects / Releases / Labels / Assignees / GitHub Apps / PAT / SHA-1-signature deferred to future slices. Slice 14b ships Batch 1 only.
- **Anything that grows beyond a GitHub-specific change** (e.g. webhook signature primitives that belong in `_shared/webhooks/`, generalized PAT support) — STOP and report.
