# Parity audit — GitHub

**Status:** Audit / not yet accepted. **Doc-only commit.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md). Priority rank §3: **11** (after Mailchimp, before Microsoft Outlook mail).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 baseline:** [`integrations/github/`](../../../integrations/github/) (Slice 14b).
**Phase 1 surface shipped:** 6 actions + 1 single-event webhook trigger (`new_commit` / `push`).
**Recommendation up front:** Unusual parity shape — **V2 already absorbed every V1 action and trigger 1:1 in Slice 14b**, including two V1 security-gap fixes that were never landed in V1. The set difference is therefore zero (V1 actions = V2 actions; V1 trigger event-types = V2 trigger event-types). Every remaining "gap" is **product expansion beyond V1**, not a V1 parity port. The audit converts that expansion frontier into named decisions for Marcus: 6 action-domain expansion buckets (close/merge/release/label/get-list/checks) and 3 trigger event-types (pull_request, issues, release_published). **No actions PORT, no triggers PORT** from V1's residual surface — there is none. **2 expansion buckets recommended NEEDS PRODUCT DECISION** (D-GH1 release-management actions; D-GH2 PR / issue-update lifecycle), **2 recommended PORT-WHEN-NEEDED** (PR events trigger; issue events trigger), **rest DEFER**. Single most important decision: whether GitHub's Phase 2 brief is "close V1 parity" (in which case the audit closes immediately — already done) or "expand the GitHub surface to match Slack / Stripe / Shopify breadth" (in which case D-GH1 + D-GH2 + the trigger event-type expansion are the work).

The V2 baseline already absorbed the only real V1 work in flight: **(a)** PR-G6 default-branch auto-detect extended to **both** `create_pull_request` (V1 had it) **and** `create_branch` (V1 hard-defaulted to literal `'main'`, fixed during port); **(b)** real `X-Hub-Signature-256` HMAC-SHA256 verification with `{ valid: false, reason: "missing_secret" | "missing_header" | "malformed" | "mismatch" }` typed result — closes V1's two silent-accept gaps; **(c)** `GITHUB_WEBHOOK_SECRET` separated from `GITHUB_CLIENT_SECRET` per defense-in-depth; **(d)** `Authorization: token` header standardized across actions and lifecycle (V1's lifecycle used `Bearer`, actions used `token` — inconsistent). This audit's PORT slice is consequently empty.

---

## 1. V1 source paths audited

### Actions

| File | Lines | Notes |
|---|---|---|
| `lib/workflows/actions/github.ts` | 650 | **Monolithic file** holding all 6 GitHub action handlers (R1 in master rot catalog). One function per action; no per-action split. |
| `lib/workflows/actions/github/schema.ts` | 229 | `FieldSchema[]` arrays for `createIssue`, `createPullRequest`, `addComment`, **and `createRelease`**. The `createRelease` schema is **dead code** — see HS-style §8 finding G-R1. Used by `smartAIAgent` (V1's AI planner) only; not the runtime config schema. |
| `lib/workflows/actions/github/` | — | Folder contains ONLY `schema.ts`. The actions registry imports `createGitHubIssue`/etc. from `../github` (i.e. the parent `github.ts` file), not from this folder. |

### Manifest

| File | Lines | Notes |
|---|---|---|
| `lib/workflows/nodes/providers/github/index.ts` | 402 | Single file declaring 1 trigger + 6 action node-types. Inline `configSchema` + `outputSchema`. Uses `dynamic:` field shape for repository / branch / issue / assignee / label / milestone dropdowns (resolves at builder time via `app/api/integrations/github/data/handlers/*.ts`). |

### Trigger lifecycle + OAuth + webhook utils

| File | Lines | Notes |
|---|---|---|
| `lib/triggers/providers/GitHubTriggerLifecycle.ts` | 244 | Per-workflow webhook lifecycle. `onActivate` POSTs `/repos/{owner}/{repo}/hooks` with `events: ['push']` + secret + `Content-Type: json`. Stores `webhookId` in `trigger_resources.external_id`. `onDeactivate` DELETEs by `webhookId`; 404 treated as success. **Bug noted in V2 slice 14b plan §"V1 bugs to fix" #5: V1 uses `Authorization: Bearer ${token}` here; V1 actions use `Authorization: token ${token}`. Inconsistent.** |
| `lib/integrations/oauthConfig.ts` (entries 149–163) | 14 | github OAuth entry — `authMethod: 'body'`, `refreshTokenExpirationSupported: true`, `refreshTokenExpiryBuffer: 60`. **Dead config** — `authSchemes.ts:83` declares `github: 'non_refreshable'`. The refresh-token fields are leftover scaffolding from a misread of GitHub's OAuth App model (which issues non-expiring tokens with NO `refresh_token` in the token-exchange response). V2 does NOT replicate this. |
| `lib/integrations/authSchemes.ts` (line 83) | 1 | `github: 'non_refreshable'` — authoritative auth-scheme declaration. |
| `lib/integrations/integrationScopes.ts` (lines 13–16) | 4 | `required: ['repo']`, `optional: ['read:org', 'gist']`. V2 manifest collapses the split — all three become `required` because every Batch 1 action needs them in practice. |
| `lib/webhooks/verification.ts` (function `verifyGitHubSignature`, lines 124–136) | 13 | Computes `HMAC-SHA256(rawBody, secret).digest('hex')`, strips `sha256=` prefix, `crypto.timingSafeEqual` compare. Algorithm is correct; **outer `verifyWebhookSignature` returns `true` (allows) when `secret` env var is missing or `signature` header is null** — V1 security gap. |
| `app/api/webhooks/github/route.ts` | 185 | Receive route. Inline `verifyGitHubSignature` duplicates `lib/webhooks/verification.ts` impl. `secret = process.env.GITHUB_WEBHOOK_SECRET \|\| process.env.GITHUB_CLIENT_SECRET` — defense-in-depth violation. Handles `ping`, `push` events; everything else 200-acks-and-skips. Routes by `payload.repository.full_name` lookup in `trigger_resources`. Dedup via `X-GitHub-Delivery` passed downstream as `dedupeKey`. |
| `lib/webhooks/normalizer.ts` | — | **No `github` case.** V1 normalizes inline in the receive route (the `if (event === 'push') { ... }` block at `route.ts:84-117`). |
| `__tests__/workflows/pr-g6-github-default-branch-autodetect.test.ts` | 225 | V1's ONLY GitHub test file. Covers the PR-G6 default-branch logic for `create_pull_request`. No action-handler tests, no OAuth tests, no lifecycle tests, no webhook signature tests. |
| `lib/workflows/testing/fixtures/webhooks/github/{push,push-nomatch}.json` | — | Sample webhook payloads used by infrastructure-level webhook tests. |
| `app/api/integrations/github/data/handlers/*.ts` (7 files: repositories, branches, issues, labels, milestones, assignees, index) | 192 total | Builder-time dropdown loaders (`/api/integrations/github/data?type=github_repositories` style). Out of scope — UI Phase 3 concern. |
| `app/api/integrations/github/revoke-and-auth/route.ts` | 69 | Disconnect-then-reconnect helper. Out of scope. |
| `lib/workflows/ai-agent/nodeConfigQuestions.ts` (entries 918–950 + 1044–1045) | — | AI-planner config-question definitions for `github_trigger_new_commit` and `github_action_create_issue` only. Other actions aren't planner-aware in V1. Out of scope (Phase 5). |
| `lib/workflows/nodes/outputSchemaFallbacks.ts` (entries 321, 353, 385, 423, 449) | — | Fallback output schemas (planner needs these to chain actions). V2 builds these inline in handler return shapes; no separate fallback registry. |

---

## 2. V1 actions inventory

V1 ships **6 action node types** in the manifest. `comingSoon: false` count: 6. Dead-code count: 1 schema (`createRelease` schema present, no handler, never registered — see §8 finding G-R1).

| # | Action key | One-line behavior |
|---|---|---|
| 1 | `github_action_create_issue` | POST `/repos/{owner}/{repo}/issues` — title required; body / labels / assignees / milestone optional. |
| 2 | `github_action_create_repository` | POST `/user/repos` — name required; description / private / auto_init / gitignore_template / license_template / homepage optional. |
| 3 | `github_action_create_pull_request` | POST `/repos/{owner}/{repo}/pulls` — repository / title / head required; **`base` optional with PR-G6 default-branch auto-detect** via `GET /repos/{owner}/{repo}` → `default_branch`; body / draft optional. |
| 4 | `github_action_create_branch` | POST `/repos/{owner}/{repo}/git/refs` — repository / branchName required; **`sourceBranch` defaults to literal `'main'`** (V1 rot — fixed in V2 port). Two-call: `GET /git/ref/heads/{source}` then `POST /git/refs`. |
| 5 | `github_action_create_gist` | POST `/gists` — filename / content required; description / isPublic optional. |
| 6 | `github_action_add_comment` | POST `/repos/{owner}/{repo}/issues/{issueNumber}/comments` — repository / issueNumber / body required. (Works on both issues and PRs — PRs are issues from the comments API's POV.) |

**Notable absences from V1 (these actions DO NOT EXIST in V1):** `get_pull_request`, `list_pull_requests`, `merge_pull_request`, `update_pull_request`, `close_pull_request`, `update_issue`, `close_issue`, `get_issue`, `list_issues`, `add_label`, `remove_label`, `assign_user`, `request_review`, `create_release`, `list_releases`, `create_check_run`, anything Actions / Projects / Webhooks-management. Slice 14b's plan ([§"Action subset — final list"](../slice-14b-github.md#action-subset--final-list-v1-derived-deviates-from-approved-shape-expected-list)) explicitly flagged the divergence from the prompt's "expected list."

---

## 3. V1 triggers inventory

V1 ships **1 trigger node type**, listening for **1 GitHub event-type** (`push`). **Webhook-based** via GitHub's repo-webhook API (`POST /repos/{owner}/{repo}/hooks`). **Lifecycle: per-workflow per-repository** — each (workflow, node) pair creates one repo webhook.

| # | Trigger key | GitHub event | Notes |
|---|---|---|---|
| 1 | `github_trigger_new_commit` | `push` | Optional `branch` config; receive route filters by branch when set. Outputs `commitId`, `commitMessage`, `authorName`, `authorEmail`, `branch`, `repository`, `commitUrl`, `timestamp`, `filesChanged`. |

**Trigger lifecycle file:** `lib/triggers/providers/GitHubTriggerLifecycle.ts` — 244 LOC. `TRIGGER_TO_EVENTS` dict maps the one trigger type to `['push']`. **Per-workflow** lifecycle. **No reference counting** — if two workflows watch the same repo, V1 creates two separate GitHub-side webhooks on that repo. (Less wasteful than HubSpot's portal-wide overlap because GitHub webhooks scope to a single repo, but still not optimal.)

**Notable absences from V1 (these triggers DO NOT EXIST in V1):** `pull_request_opened`, `pull_request_merged`, `pull_request_closed`, `pull_request_review_submitted`, `pull_request_review_requested`, `issues_opened`, `issues_closed`, `issues_assigned`, `issue_comment_created`, `release_published`, `release_created`, `check_run_completed`, `workflow_run`, `deployment_status`, `star`, `fork`, `team_member_added`. GitHub ships 60+ webhook event types; V1 covers exactly 1.

---

## 4. V2 current surface

V2 ships **6 actions + 1 trigger** — exact 1:1 parity with V1's surface, plus four real V1 fixes landed during the port.

### Actions (6)

Registered in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) at entries 446–451:

`create_issue`, `create_repository`, `create_pull_request`, `create_branch`, `create_gist`, `add_comment`.

Each action is a per-file `ActionHandler` with sibling `.schema.ts` ([`integrations/github/actions/*.ts`](../../../integrations/github/actions/)). All use the shared [`integrations/_shared/github/api/*.ts`](../../../integrations/_shared/github/api/) wrappers (`_request.ts`, `_base.ts`, `repos.ts`, `issues.ts`, `pulls.ts`, `gists.ts`, `webhooks.ts`, `resolveDefaultBranch.ts`). Every action's principal call is wrapped in [`refreshAndRetry`](../../../services/oauth/refreshAndRetry.ts); auxiliary calls (e.g. `resolveDefaultBranch`, `gitRefGet` inside `create_branch`) are wrapped too per CLAUDE.md "OAuth 401 Handling — Provider-Aware Refresh+Retry" §"Auxiliary calls."

Because GitHub is non-refreshable, 401 surfaces as `IntegrationActionRequiredError(reason: "refresh_not_supported")` with no refresh attempt — same shape as Slack / Notion / Shopify.

### Trigger (1)

`new_commit` — [`integrations/github/triggers/newCommit/`](../../../integrations/github/triggers/newCommit/). Per-workflow per-repository webhook lifecycle:
- **Activate** ([`activate.ts`](../../../integrations/github/triggers/newCommit/activate.ts)) creates one repo webhook subscribed to `push` only. Persists `hookId` + `repository` + `owner` + `repo` + `branch` + `events: ["push"]` + `notificationUrl` in `trigger_resources.config`.
- **Deactivate** ([`deactivate.ts`](../../../integrations/github/triggers/newCommit/deactivate.ts)) DELETEs the hook. Best-effort 404 / 401 → swallow.
- **No `subscription-watch` marker** — GitHub repo webhooks don't expire. The `runRenewals` cron filters on `config.type === "subscription-watch"` and the activate hook intentionally omits it so the renewal cron never picks up GitHub rows. Same "permanent endpoint" pattern as Slice 11 Stripe and Slice 12 Shopify.

### Webhook receive + signature verification

- [`app/api/webhooks/github/route.ts`](../../../app/api/webhooks/github/route.ts) — strict-direct-lookup via `?workflowId=X&nodeId=Y` query params (set at activation time, mirrors Slice 11 / 12).
- [`integrations/github/triggers/newCommit/receive.ts`](../../../integrations/github/triggers/newCommit/receive.ts) — typed `ReceiveResult` discriminator: `unknown_workflow` (200 quiet ack), `ping_event` (200 + `{ok: true, message: "pong"}` — GitHub registration handshake), `unsupported_event` (200 ack), `branch_filtered` (200 ack), `events` (dispatch). `MissingSecretError` → 503 (closes V1 silent-accept gap #1); `InvalidSignatureError` → 401 (closes V1 silent-accept gap #2).
- [`integrations/_shared/github/webhooks/signature.ts`](../../../integrations/_shared/github/webhooks/signature.ts) — HMAC-SHA256-hex verify with typed result `{ valid: true } | { valid: false; reason: "missing_header" | "malformed" | "mismatch" | "missing_secret" }`. Length-mismatch guard runs BEFORE `crypto.timingSafeEqual` (which throws on different-length buffers). Keyed on `GITHUB_WEBHOOK_SECRET` — distinct from `GITHUB_CLIENT_SECRET` (V1 used `WEBHOOK_SECRET || CLIENT_SECRET` fallback).

### Manifest

[`integrations/github/manifest.ts`](../../../integrations/github/manifest.ts) — `oauth: true`, `actions: true`, `webhookTrigger: true`, `pollingTrigger: false`. 3 required scopes (`repo`, `read:org`, `gist`) — V1's split (`repo` required; `read:org`, `gist` optional) collapsed because every Batch 1 action needs all three in practice (Slice 14b plan §"OAuth model" #5). 4-hour health-check interval. `refreshable: false`. `accountIdField: "login"`. `apiVersion: "2022-11-28"` pinned via `X-GitHub-Api-Version` header. `tokenScope: "user"` — one integration per (user, GitHub login).

### Tests

V2 ships **22 GitHub test suites** at [`tests/unit/integrations/github/`](../../../tests/unit/integrations/github/) + [`tests/unit/integrations/_shared/github/`](../../../tests/unit/integrations/_shared/github/) covering each action + each trigger lifecycle stage + manifest + OAuth + each shared API wrapper + the signature module + the errors module. V1 ships **1** test file (`pr-g6-github-default-branch-autodetect.test.ts` covering only the PR-G6 path). V2 has **~20× more test density** than V1 for GitHub.

E2e: [`tests/e2e/slice-14b-github-walkthrough.spec.ts`](../../../tests/e2e/slice-14b-github-walkthrough.spec.ts) (616 LOC) — runs against [`tests/e2e/helpers/mockGitHubServer.ts`](../../../tests/e2e/helpers/mockGitHubServer.ts) (1414 LOC). Asserts OAuth + integration row + at least one action + lifecycle + signature scenarios (valid / 401 / 503) + delivery dedup + end-to-end workflow run.

---

## 5. Missing actions

Set difference: V1 actions (6) minus V2 actions (6) = **0 missing actions**.

V2 already absorbed every V1 action 1:1 in Slice 14b. No residual V1 parity gap.

Every action mentioned later in this audit's expansion-frontier analysis (§7 below) is **net-new beyond V1** — it does not exist in V1 today, so porting it isn't parity work; it's product expansion. The phase-2-plan.md §1 distinguishes these decisions explicitly:

> Phase 2 closes the gap by auditing each ported provider against V1's full surface and deciding — per action and per trigger — whether to: **Port** — high-value, low-rot, fits V2 contracts. … **Needs product decision** — Marcus has to choose before the recommendation is actionable.

GitHub's gap-from-V1 is zero. The product-decision frontier is non-zero and is captured in §15.

---

## 6. Missing triggers

Set difference: V1 trigger event-types (1: `push`) minus V2 trigger event-types (1: `push`) = **0 missing trigger event-types**.

V2 already absorbed V1's sole trigger. No residual V1 parity gap.

The trigger surface that GitHub's API supports is dramatically larger than V1's coverage (60+ event types — pull_request, issues, release, deployment, check_run, workflow_run, star, fork, etc.). None of those are V1 ports — they're product expansion. Captured in §15.

---

## 7. Port / skip / defer table

The standard table shape doesn't fit GitHub's audit because the row set from §§5+6 is empty. To preserve the template, the table below shows the **product-expansion frontier** instead — the V1-doesn't-exist items that the audit needs Marcus to decide on. Every row is "NEEDS PRODUCT DECISION" or "DEFER (PORT-WHEN-NEEDED)" by definition — no row is a V1-parity port.

### Product-expansion frontier (not V1 parity — beyond-V1)

| Item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `update_issue` (PATCH `/repos/{o}/{r}/issues/{n}`) | Action | **DEFER (PORT-WHEN-NEEDED)** | Symmetric to `create_issue` already shipped. Mid-complexity (state, title, body, labels[] replace-vs-add semantics, assignees[] replace-vs-add semantics, milestone). Only port when a real workflow needs to mutate an existing issue. |
| `close_issue` (PATCH with `state: 'closed'`) | Action | **DEFER (PORT-WHEN-NEEDED)** | Thin specialization of `update_issue`. Closing an issue is the most common mutation; could ship as its own action OR as a state field on `update_issue`. Defer until D-GH2 decides which. |
| `update_pull_request` (PATCH `/repos/{o}/{r}/pulls/{n}`) | Action | **NEEDS PRODUCT DECISION (D-GH2)** | Symmetric to `create_pull_request`. PR state mutation (`state`, `title`, `body`, `base`, `draft`) is bundled with merge/close behaviors that compose into a "PR lifecycle" feature. Need Marcus to decide whether GitHub's PR lifecycle is in scope. |
| `merge_pull_request` (PUT `/repos/{o}/{r}/pulls/{n}/merge`) | Action | **NEEDS PRODUCT DECISION (D-GH2)** | Destructive (irreversible merges; `merge_method` of `merge` / `squash` / `rebase` has different semantics). High product leverage if PR-automation is the target use case. **No hidden defaults rule (R8 / Q11)**: `merge_method` must be required, not silently defaulted — `merge` (the GitHub API default) is the wrong choice for repos that mandate squash. See §15 D-GH2. |
| `close_pull_request` (PATCH with `state: 'closed'`) | Action | **NEEDS PRODUCT DECISION (D-GH2)** | Closes WITHOUT merging. Pairs with merge in a PR-lifecycle bundle. |
| `add_label` / `remove_label` (POST / DELETE `/issues/{n}/labels`) | Actions | **DEFER (PORT-WHEN-NEEDED)** | Currently labels are settable at issue creation via `create_issue`'s `labels[]` field. Net-new labels-after-create is a mid-leverage add. |
| `assign_user` / `unassign_user` (POST / DELETE `/issues/{n}/assignees`) | Actions | **DEFER (PORT-WHEN-NEEDED)** | Same shape as labels — settable at create, mutation needs net-new action. |
| `request_review` (POST `/pulls/{n}/requested_reviewers`) | Action | **DEFER (PORT-WHEN-NEEDED)** | PR-reviewer-requests are surprisingly common in automation workflows ("ship-it-bot" patterns). Defer until D-GH2 lands. |
| `create_release` (POST `/repos/{o}/{r}/releases`) | Action | **NEEDS PRODUCT DECISION (D-GH1)** | V1 has a **dead `createRelease` field schema** at `lib/workflows/actions/github/schema.ts:170-229` but no handler implementation. The schema's existence signals V1 wanted to ship this and never did. High product leverage for tag-based release workflows. **No hidden defaults rule (R8 / Q11)**: `draft` and `prerelease` are high-risk defaults that historically default to `false` — but a "publish a release as draft until reviewed" workflow needs draft `true`. Both must be required, no silent default. See §15 D-GH1. |
| `list_releases` (GET `/repos/{o}/{r}/releases`) / `get_release` | Actions | **NEEDS PRODUCT DECISION (D-GH1)** | Read-side companions to `create_release`. Bundled into D-GH1. |
| `get_pull_request` (GET `/pulls/{n}`) / `list_pull_requests` (GET `/pulls`) / `get_issue` (GET `/issues/{n}`) / `list_issues` (GET `/issues`) | Actions | **DEFER (PORT-WHEN-NEEDED)** | Read-side companions. Useful in workflows that want to enrich downstream node data from a webhook payload's `issue.number` / `pull_request.number`. Defer until a workflow actually requires them. |
| Checks API / Actions API / Projects API | Actions (bucket) | **DEFER (PORT-WHEN-NEEDED)** | Out of scope for any Phase 2 slice. GitHub Apps installation model (different from OAuth App) would be the prerequisite — a platform-tier add. |
| `pull_request` event (15 sub-events: opened, closed, merged, review_requested, ready_for_review, etc.) | Trigger event-type | **PORT-WHEN-NEEDED + NEEDS PRODUCT DECISION on shape (D-GH3)** | Highest-leverage trigger expansion. PR webhooks are how "review-bot," "auto-merge-bot," and "ship-it" workflows route in the wild. Question for Marcus: is each sub-event its own trigger node (V1 17-trigger-types HubSpot shape — high UI clutter) OR is it one `pull_request_received` consolidated trigger with a sub-event allowlist at config time (V2 HubSpot consolidated-trigger shape — proven good UX)? See §15 D-GH3. |
| `issues` event (4 sub-events: opened, closed, reopened, edited, etc.) | Trigger event-type | **PORT-WHEN-NEEDED + NEEDS PRODUCT DECISION on shape (D-GH3)** | Same shape decision as `pull_request`. |
| `release` event (`published`, `created`, `edited`) | Trigger event-type | **PORT-WHEN-NEEDED** (bundle with D-GH1) | Pairs with create_release as a "release lifecycle" feature. |
| `issue_comment` / `pull_request_review` / `pull_request_review_comment` events | Trigger event-types | **DEFER (PORT-WHEN-NEEDED)** | Specialized — useful for review-bot workflows but lower priority than core PR events. |
| `workflow_run` / `check_run` / `deployment` / `deployment_status` events | Trigger event-types | **DEFER (PORT-WHEN-NEEDED)** | CI/CD integration territory. Pairs with the Checks/Actions API skip decision. |
| `star` / `fork` / `watch` / `team_member_added` / 30+ other events | Trigger event-types | **SKIP (low product leverage)** | Long-tail events. Skip permanently unless a specific workflow requests one. |

### Decision counts

- **PORT (from V1):** 0 items (V1 surface already fully ported).
- **PORT-WHEN-NEEDED + NEEDS DECISION on shape:** 2 items (`pull_request` events, `issues` events) — see D-GH3.
- **NEEDS PRODUCT DECISION:** 2 expansion buckets (`release_*` — D-GH1; PR / issue lifecycle mutations — D-GH2).
- **DEFER (PORT-WHEN-NEEDED):** 10+ items (`update_issue`, `close_issue`, labels mutations, assignees mutations, request_review, get/list reads, release event, comment-review events, etc.).
- **SKIP:** long-tail webhook event-types (`star`, `fork`, `watch`, etc.) — permanent unless explicit demand.

---

## 8. V1 rot / bugs / dead code inventory

V1 rot beyond the master-plan §5 categories. Cited with file paths + LOC. Every entry below was closed by V2 during the original Slice 14b port — nothing here remains as V1-rot-to-port.

| ID | Pattern | Status |
|---|---|---|
| **R7** (master) | **Unsafe webhook verification — silent accept #1.** `lib/webhooks/verification.ts:18-20` (`if (!secret) return true`) AND `app/api/webhooks/github/route.ts:26-28` returns `true` when `GITHUB_WEBHOOK_SECRET` is missing — silently accepts unsigned webhooks. | **CLOSED in V2** — [`signature.ts`](../../../integrations/_shared/github/webhooks/signature.ts) returns `{ valid: false, reason: "missing_secret" }` → route maps to 503 (server misconfig). |
| **R7** (master) | **Silent accept #2 — missing signature header.** `app/api/webhooks/github/route.ts:31-34` returns `true` when `signatureHeader` is null (comment: "Allow in development"). Crafted requests with no signature bypass verification in production. | **CLOSED in V2** — [`signature.ts`](../../../integrations/_shared/github/webhooks/signature.ts) returns `{ valid: false, reason: "missing_header" }` → route maps to 401. |
| **R1** (master) | **Monolithic action file.** `lib/workflows/actions/github.ts` — 650 LOC with all 6 handlers in one file. | **CLOSED in V2** — per-action split at [`integrations/github/actions/{addComment,createBranch,createGist,createIssue,createPullRequest,createRepository}.ts`](../../../integrations/github/actions/) with sibling schema files. |
| **R10** (master) | **Inconsistent ActionResult shape.** V1 handlers return `{success, output, message}` shape; the success path includes `githubResponse: result` (raw API response). Downstream variable-resolution surface is broad and unbounded. | **CLOSED in V2** — every V2 handler returns a bounded `output: { ... }` shape with named fields. Raw API responses are NOT exposed downstream. |
| **R9** (master) | **Inline integration row lookups in every handler.** V1's handlers each query the `integrations` table inline (`from('integrations').select('*').eq('user_id', userId).eq('provider', 'github')...`). 6 copies of the same code. | **CLOSED in V2** — handlers use `refreshAndRetry` which sources the token from the integration row centrally. No per-handler integration lookups. |
| **G-R1** | **Dead `createRelease` schema** at `lib/workflows/actions/github/schema.ts:170-229` (59 LOC) declares a field schema for `create_release` with `tag_name`, `name`, `body`, `target_commitish`, `draft`, `prerelease`, `repository`. **No handler implements this; no manifest entry registers it.** Used only by `smartAIAgent` (V1's AI planner) as planner context. The planner can claim "I could create a GitHub release for this" but the workflow runtime cannot execute it — a fail-at-runtime UX bug if the planner ever recommended it. | **NOT PORTED in V2** — V2 doesn't ship a `create_release` action at all. The dead schema is a strong signal V1 wanted release-management actions but never landed them — see §15 D-GH1. |
| **G-R2** | **Bearer/token auth header inconsistency.** `lib/triggers/providers/GitHubTriggerLifecycle.ts:92` uses `Authorization: Bearer ${accessToken}`; `lib/workflows/actions/github.ts` uses `Authorization: token ${accessToken}` (lines 70, 169, 277, 317, 414, 500, 520, 616). Both work against GitHub's REST API in practice; `token` is GitHub's documented convention for OAuth App tokens. | **CLOSED in V2** — [`_request.ts:93`](../../../integrations/_shared/github/api/_request.ts#L93) uses `token` everywhere; lifecycle calls go through the same shared `_request.ts` via [`webhooks.ts`](../../../integrations/_shared/github/api/webhooks.ts). |
| **G-R3** | **Webhook-secret-from-OAuth-client-secret fallback.** `app/api/webhooks/github/route.ts:25` reads `process.env.GITHUB_WEBHOOK_SECRET \|\| process.env.GITHUB_CLIENT_SECRET`. Defense-in-depth violation (leak of one compromises both). | **CLOSED in V2** — [`activate.ts:63-71`](../../../integrations/github/triggers/newCommit/activate.ts#L63) and [`receive.ts:87-94`](../../../integrations/github/triggers/newCommit/receive.ts#L87) require `GITHUB_WEBHOOK_SECRET` only — activation fails-closed at design time if missing. |
| **G-R4** | **`createGitHubBranch` hard-defaults `sourceBranch` to literal `'main'`.** `lib/workflows/actions/github.ts:465` (`const { repository, branchName, sourceBranch = "main" } = resolvedConfig`). Same `'main'`-guess rot that PR-G6 fixed for `create_pull_request`. | **CLOSED in V2** — [`createBranch.ts:42-53`](../../../integrations/github/actions/createBranch.ts#L42) applies PR-G6 default-branch auto-detect via [`resolveDefaultBranch`](../../../integrations/_shared/github/api/resolveDefaultBranch.ts). Fail-closed on lookup error; never silently uses `'main'`. |
| **G-R5** | **Dead `refreshTokenExpirationSupported: true` config.** `lib/integrations/oauthConfig.ts:155-162` declares refresh-related fields that contradict `authSchemes.ts:83`'s `'non_refreshable'`. GitHub OAuth Apps issue non-expiring tokens with no `refresh_token` — refresh-related fields are leftover scaffolding from a misread of the OAuth App model. | **NOT REPLICATED in V2** — manifest is `refreshable: false`, no refresh-buffer config. Per-provider `refreshToken()` throws `RefreshNotSupportedError("github")`. |
| **G-R6** | **Hand-rolled `verifyGitHubSignature` duplicated in two files.** Once at `lib/webhooks/verification.ts:124-136`; once inline at `app/api/webhooks/github/route.ts:23-43`. Drift risk. | **CLOSED in V2** — single [`signature.ts`](../../../integrations/_shared/github/webhooks/signature.ts) module imported by the route. Mirrors `_shared/shopify/webhooks/signature.ts` shape. |
| **G-R7** | **Inline webhook normalization in receive route.** `app/api/webhooks/github/route.ts:84-117` constructs `triggerData` directly from `payload` fields. No `lib/webhooks/normalizer.ts` `github` case — V1 chose to inline. | **CLOSED in V2** — extracted to [`normalize.ts`](../../../integrations/github/triggers/newCommit/normalize.ts) (213 LOC), separate normalizer module. Tested independently. |
| **G-R8** | **Single test file.** `__tests__/workflows/pr-g6-github-default-branch-autodetect.test.ts` (225 LOC) is V1's ONLY GitHub test, and it covers ONE handler's auto-detect path. No action-handler tests, no OAuth tests, no lifecycle tests, no webhook signature tests. | **NOT PORTED** — V2 ships 22 GitHub test suites (per-action / per-trigger-stage / manifest / OAuth / each API wrapper / signature module / errors module). Test density now in line with other V2 providers. |
| **G-R9** | **Per-workflow webhook lifecycle with no reference counting.** V1 creates one repo webhook per workflow per node. If 5 workflows watch the same repo for `push` events, V1 creates 5 separate webhooks on that repo. GitHub allows it (no hard cap; soft warning for >20 per repo) but it's wasteful. | **NOT MITIGATED in V2** — V2 inherits the same one-webhook-per-(workflow, node) model. This is intentional per Slice 14b plan §"Webhook model" #6: GitHub's per-repo webhook isn't shared-by-design like HubSpot's app-level model, and the per-workflow lifecycle is simpler to reason about. The audit flags this as a future-optimization candidate — **NOT a parity blocker** — see §10 "Required platform gaps." |

No new master-catalog entries surface from this audit — every rot finding fits an existing master row or stays GitHub-specific (G-R1..G-R9).

---

## 9. V2 dependency map

The empty PORT set (§§5+6) means this section has **no rows to map**. If Marcus accepts one or more of the §15 product-decision frontier items, the dependency map at that point will be:

| Item | API wrapper | Handler shape | Schema shape | Other deps |
|---|---|---|---|---|
| `update_issue` / `close_issue` | [`issues.ts`](../../../integrations/_shared/github/api/issues.ts) — needs `issuesPatch({owner, repo, issueNumber, ...patch})` companion (~25 LOC) | New `actions/updateIssue.ts` (~70 LOC) + optionally `actions/closeIssue.ts` thin specialization (~30 LOC) | New Zod schemas — `state: 'open' \| 'closed'` enum at minimum | None new |
| `update_pull_request` / `merge_pull_request` / `close_pull_request` | [`pulls.ts`](../../../integrations/_shared/github/api/pulls.ts) — needs `pullsPatch` (~25 LOC) and `pullsMerge` (~30 LOC) companions. **`merge_method` required, no default** (R8 / Q11). | 3 new handler files (~100 LOC total). `merge_pull_request` uses Q4 idempotency bracketing (merge is destructive — replay must not double-merge a closed PR). | New Zod schemas | None new — V2's idempotency layer (`sessionSideEffects` core helper) already exists. |
| `create_release` / `list_releases` / `get_release` | New shared wrapper file [`integrations/_shared/github/api/releases.ts`](../../../integrations/_shared/github/api/) — ~80 LOC. | 3 new handler files (~150 LOC total). **`draft` and `prerelease` required, no defaults** (R8 / Q11). | New Zod schemas | None new |
| `add_label` / `remove_label` / `assign_user` / `unassign_user` / `request_review` | Extend [`issues.ts`](../../../integrations/_shared/github/api/issues.ts) + [`pulls.ts`](../../../integrations/_shared/github/api/pulls.ts) with 5 small companions (~15 LOC each) | 5 new handler files (~50 LOC each) | New Zod schemas | None new |
| `pull_request` event-type trigger | Existing [`activate.ts`](../../../integrations/github/triggers/newCommit/activate.ts) shape generalizes — event-type list becomes config field, not hardcoded `['push']`. | NEW per-event-type trigger definition under `triggers/pullRequest/` (or `triggers/webhookReceived/` if D-GH3 picks consolidated shape — see §15). Receive route handles the new event in `EVENT_HEADER` switch. | `pull_request_action` enum at config time (`opened` / `closed` / `merged` / `review_requested` / etc.) | Depends on D-GH3 shape decision. Plus normalize.ts extension for PR payload shape. |
| `issues` event-type trigger | Same pattern. | Same pattern. | Same pattern. | Same as above. |
| `release` event-type trigger | Same pattern. | Same pattern. | Same pattern. | Same as above. Bundle with D-GH1. |

**No new contract surface required for any individual expansion.** No new repository tables (`trigger_resources` + `webhook_event_dedup` already exist). The only platform-tier consideration is **trigger surface consolidation shape (D-GH3)** — see §10.

---

## 10. Required platform gaps

**None for V1 parity** — V2 already shipped everything Slice 14b needed.

**Conditional on §15 expansion decisions:**

1. **D-GH3 shape decision — separate trigger types vs. consolidated `webhook_received`.** This is NOT a platform gap; it's a per-provider trigger-shape choice. Both shapes work with V2's existing trigger-resources + dispatch infrastructure. The HubSpot precedent (Slice 13 + parity audit) ships a single consolidated `webhook_received` with a subscription-type allowlist; the Slack precedent (Slice 8) ships per-event trigger types. Pick one; both have e2e proof.

2. **GitHub App installation model.** If Marcus decides Checks API / Actions API / Projects API are in scope, V2 needs a parallel "GitHub App" auth model (user-to-server tokens that DO refresh, app-level webhook delivery). This IS a platform-tier addition — its own slice, NOT bundled into a parity port. Recommendation: SKIP unless a concrete workflow requires it. The OAuth App model V2 currently ships covers everything in the §15 D-GH1 / D-GH2 product-decision frontier.

3. **Per-repo webhook reference counting** (G-R9 mitigation). Not a parity gap. Could ship as a future-optimization slice if a workflow author hits GitHub's soft warning at >20 webhooks per repo. Recommendation: SKIP until concrete need.

No PORT-set in §§5+6 means **no required platform gap blocks any current Phase 2 work for GitHub.**

---

## 11. Effort estimate

The standard "comparable to Sheets 2.3" framing doesn't fit GitHub's audit because **there is no PORT-set to size**. Per the parity-slice shape from phase-2-plan §6, a single audit-doc commit is enough to close this audit:

| Reference | Approx commit count |
|---|---|
| **GitHub parity (V1 surface = V2 surface)** | **1 commit** — this audit doc only. |

**Conditional commit counts if §15 product-decisions land:**

| Decision | Approx commit count |
|---|---|
| D-GH1 = PORT (`create_release` / `list_releases` / `get_release` + `release` event-type trigger) | **3 commits** — 1 actions feat (~250 LOC + tests) + 1 trigger feat (~150 LOC + tests + receive-route allowlist extension) + 1 outcomes doc. |
| D-GH2 = PORT (PR / issue lifecycle: `update_*`, `close_*`, `merge_pull_request`, `add_label`, `assign_user`, `request_review`) | **5–6 commits** — split along PR-lifecycle vs. issue-lifecycle vs. metadata (labels/assignees/reviewers). Each feat commit ~3 handlers + tests. Plus 1 outcomes doc. |
| D-GH3 = consolidated `webhook_received` shape (replaces `new_commit`) | **3 commits** — 1 trigger-consolidation refactor (subscription-type allowlist + normalize generalization + receive-route generalization) + 1 e2e extension + 1 outcomes doc. Includes a backward-compat decision: drop `new_commit` outright OR alias it. |
| D-GH3 = separate-trigger-type shape (1 trigger per event-type) | **N commits** where N = event types added. Likely smaller per-commit than the consolidated approach but more commits in aggregate. |

**Total high-end if D-GH1 + D-GH2 + D-GH3 all land:** 10–12 commits — comparable to Slack 2.3 / 2.4 sized. **Total low-end if Marcus declines all three:** 0 implementation commits — audit doc is the deliverable.

---

## 12. Risk estimate

Top 3 risks. Note: with PORT set empty, "risk" here means "risk of accepting one of the §15 expansion decisions," not risk of the audit-doc commit.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R-GH-1** — D-GH2 PR/issue lifecycle introduces destructive operations (`merge_pull_request`) that V2 hasn't shipped per-handler idempotency for outside the engine layer. | Medium | High | Q4 contract is mature in V2 — `sessionSideEffects` core helper exists, Stripe/HubSpot/etc. already use it. `merge_pull_request` MUST bracket itself with `checkReplay`/`recordFired` at the handler level until the engine wraps it. Hashing the request payload protects against retries with mutated configs. Marcus accept criterion in §14 includes verification of this. |
| **R-GH-2** — D-GH3 shape decision (consolidated `webhook_received` vs. per-event triggers) sets the pattern for **every future GitHub trigger expansion**. Wrong choice = either a UI clutter problem (per-event-trigger explosion as we add `pull_request` / `issues` / `release` / `workflow_run` / `check_run` / etc.) OR a UX-mismatch problem (consolidated trigger that bundles unrelated event shapes — `release.published` payload looks nothing like `push` payload). | Medium | Medium | The consolidated `webhook_received` model is the V2 default for providers with broad webhook surface (HubSpot, Shopify) — proven good UX. The per-event-trigger model is V2's choice for providers with narrow surface (Slack — only `message_received` matters at scale; Discord similar). GitHub falls into the broad-surface camp. **Recommendation:** D-GH3 = consolidated `webhook_received` with a curated subscription-allowlist. The `new_commit` (push) trigger can stay alias-aware for backward compatibility OR migrate cleanly. See §15 D-GH3. |
| **R-GH-3** — Phase 2 priority rank says "GitHub Phase 2 work is V1 parity." V1 parity is already done. Auditing GitHub before all higher-priority audits (Slack / Gmail / Notion / Excel / Sheets / Stripe / Airtable / Shopify / HubSpot / Mailchimp / Microsoft Outlook mail) close their PORT-sets may be wasted effort if Marcus's actual GitHub direction shifts away from product expansion. | Low | Low | This audit doc is doc-only. Accept the audit's null-PORT recommendation, defer §15 decisions, and revisit when a downstream user need surfaces (e.g. Phase 3 builder UI adds GitHub workflows that need PR/release lifecycle). The audit is reusable — its §15 decisions don't expire. |

No risk warrants splitting the audit. No risk warrants a feature flag. The audit's own recommended path (no implementation, just acceptance) has zero implementation risk.

---

## 13. Recommended parity batch plan

A 1-commit slice (just the audit doc):

| # | Commit | What lands |
|---|---|---|
| 1 | (this) | `docs(github): add parity audit` — doc-only |

**If §15 product decisions land subsequently, the implementation commits would be:**

| # | Commit (conditional) | What lands |
|---|---|---|
| 2 | (conditional, D-GH1=PORT) | `feat(github): add release-management actions` — `create_release`, `list_releases`, `get_release`. New `_shared/github/api/releases.ts` wrapper. Handlers + Zod schemas + tests. Manifest stays unchanged (no new capability flag). |
| 3 | (conditional, D-GH1=PORT) | `feat(github): add release event-type trigger` — `release` event (or extends `webhook_received` allowlist if D-GH3=consolidated). Receive-route + normalize + activate-deactivate parity for the new event. E2e extension. |
| 4 | (conditional, D-GH2=PORT) | `feat(github): add PR lifecycle actions` — `update_pull_request`, `merge_pull_request`, `close_pull_request`. **`merge_method` required (no hidden default)**. Q4 idempotency bracketing on `merge_pull_request`. |
| 5 | (conditional, D-GH2=PORT) | `feat(github): add issue lifecycle actions` — `update_issue`, `close_issue`. State-mutation only; no Q4 special-case (idempotent at HTTP level). |
| 6 | (conditional, D-GH2=PORT) | `feat(github): add label and assignee mutation actions` — `add_label`, `remove_label`, `assign_user`, `unassign_user`, `request_review`. |
| 7 | (conditional, D-GH3=consolidated) | `feat(github): migrate new_commit to consolidated webhook_received trigger` — subscription-type allowlist + normalize generalization. Backward-compat alias OR clean cutover (Marcus picks). Adds `pull_request_received`, `issues_received` event-types behind the same trigger node. |
| 8 (or 7) | docs | `docs(github): document parity outcomes` — outcomes retro per the Sheets 2.3 / HubSpot 2.1 template. |

**Conditional commit count high-end:** 7 commits + 1 outcomes doc.
**Conditional commit count low-end (audit-only, default recommendation):** 1 commit (this doc).

Each implementation commit individually passes gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npx jest tests/unit/integrations/github/`
- `npm test`
- (Implementation commits) `CI=1 npx playwright test tests/e2e/slice-14b-github-walkthrough.spec.ts --workers=1` — twice for cross-run stability if randomized values are used.

Explicit path staging only — no `git add .`. Unrelated parallel-work files untouched.

---

## 14. Exit checklist

This audit is complete when Marcus has confirmed:

- [ ] V2 already absorbed V1's full surface in Slice 14b — V1 actions (6) = V2 actions (6); V1 trigger event-types (1) = V2 trigger event-types (1). **No PORT-set remains.**
- [ ] G-R1..G-R9 V1 rot findings are accurate (every one CLOSED in V2 during Slice 14b, except G-R9 NOT MITIGATED but documented as future-optimization candidate, not a blocker).
- [ ] D-GH1 (release-management actions + `release` event trigger) has a direction: SKIP / PORT / DEFER.
- [ ] D-GH2 (PR / issue lifecycle mutations) has a direction: SKIP / PORT / DEFER.
- [ ] D-GH3 (trigger surface shape — consolidated `webhook_received` vs. per-event triggers) has a direction: STAY-AS-IS (`new_commit` only) / CONSOLIDATE-PROACTIVELY (for future expansion) / PORT-EXPANSION-WITH-SEPARATE-TRIGGERS.
- [ ] The audit's null-PORT recommendation matches Marcus's read of Phase 2 brief — i.e. that "GitHub Phase 2" is read as "audit and decide what expansion to do," NOT "port more from V1."
- [ ] No required platform gaps are missed.

**Implementation does NOT begin before Marcus accepts this audit and resolves D-GH1 / D-GH2 / D-GH3 (or explicitly defers them).**

---

## 15. Open decisions for Marcus

GitHub's audit produces 3 open decisions — every one is **product expansion beyond V1**, not V1 parity.

### D-GH1 — Release-management actions + release event trigger

V1 has a **dead `createRelease` field schema** at `lib/workflows/actions/github/schema.ts:170-229` but no handler implementation. The schema's existence signals V1 wanted to ship this and never did. GitHub's release surface is high product leverage for tag-based workflows ("when a release is tagged → publish notes to Slack → trigger downstream deploy"); release-management is also a stable, well-documented surface (GitHub REST API `/repos/{owner}/{repo}/releases`).

Three options:

- **(a) SKIP.** GitHub Phase 2 closes after this audit with no implementation work. Re-open when a real workflow asks. Lowest cost.
- **(b) PORT release actions only.** Add `create_release`, `list_releases`, `get_release` (3 actions + 1 shared wrapper file). No new trigger surface. ~2 implementation commits.
- **(c) PORT release actions + release event trigger.** Adds the `release` event-type to the trigger surface alongside the actions. Either as its own trigger node (`release_published`) or as an event-type on a future consolidated `webhook_received` trigger (see D-GH3). Bundles the action and trigger as a "release lifecycle" feature. ~3 implementation commits.

**Q11 / R8 note:** `draft` and `prerelease` are high-risk defaults. A "publish a release as draft until reviewed" workflow needs `draft: true`; the safe-default for an automation that ships releases on tag is `draft: false`. **Both must be REQUIRED** when these actions ship — no silent default. Mirrors `requireExplicitField` pattern from `lib/workflows/actions/core/requireExplicitField.ts` (V1 reference; V2 has the equivalent at engine layer).

**Recommendation: (a) SKIP** until a real workflow asks. The dead V1 schema is a 1-line "intended but never shipped" finding — it's not evidence of user demand.

### D-GH2 — PR / issue lifecycle mutation actions

V1 ships `create_*` actions only. PR / issue lifecycle mutations (`update_pull_request`, `merge_pull_request`, `close_pull_request`, `update_issue`, `close_issue`, `add_label`, `remove_label`, `assign_user`, `unassign_user`, `request_review`) DO NOT EXIST in V1. Workflows that want to mutate an existing PR or issue after creation cannot do so in V1 today. This is the largest single product-expansion bucket for GitHub.

Three options:

- **(a) SKIP.** GitHub Phase 2 closes after this audit. Re-open when a real workflow asks. Lowest cost.
- **(b) PORT minimal lifecycle.** `update_issue`, `close_issue`, `merge_pull_request`. 3 actions covering the highest-leverage mutations. ~2 implementation commits.
- **(c) PORT full lifecycle.** All 10 mutations listed above. ~3–4 implementation commits split along PR-lifecycle vs. issue-lifecycle vs. metadata.

**Q11 / R8 + Q4 idempotency notes:**
- `merge_pull_request` `merge_method` (`merge` / `squash` / `rebase`) MUST be required — GitHub's API default `merge` is wrong for repos that mandate squash. No silent default.
- `merge_pull_request` is destructive (irreversible). Q4 idempotency bracketing at the handler level is mandatory until V2's engine wraps writes globally.

**Recommendation: (a) SKIP** as default, **(b) PORT minimal lifecycle** only if Marcus has a concrete workflow in mind. The 10-action breadth of (c) is templated work but has unclear demand.

### D-GH3 — Trigger surface shape (consolidation vs. per-event triggers)

V2 currently ships one trigger type — `new_commit` (push event). If D-GH1 or D-GH2 lands, OR if Marcus wants to expand trigger coverage (`pull_request` / `issues` / `release` / `workflow_run` / etc.) at any future point, V2 must decide whether each new event-type gets its own trigger node OR whether the existing trigger consolidates into a `webhook_received` allowlist shape.

Three options:

- **(a) STAY-AS-IS.** Keep `new_commit` as a single-event trigger. If/when expansion happens, choose the shape then. Lowest cost; defers the decision. Risk: the choice gets made under pressure when adding `pull_request_opened` and locks in a worse pattern than a fresh design would.
- **(b) CONSOLIDATE PROACTIVELY** (recommended pattern). Refactor `new_commit` into a `webhook_received` trigger with a subscription-type allowlist at config time. Initial allowlist is just `["push"]`. Future event-types (D-GH1's `release`, D-GH2-coupled `pull_request`, `issues`) extend the allowlist mechanically. Mirrors HubSpot's V2 consolidation that closed `HS-R1`. ~3 implementation commits.
- **(c) ADD PER-EVENT TRIGGERS** as expansion happens. Keep `new_commit` plus add `pull_request_received`, `issues_received`, `release_published` etc. as separate trigger nodes. Mirrors V1's HubSpot 17-trigger split (which V1 had and HubSpot V2 collapsed). High UI clutter at scale; matches Slack's narrower-surface pattern.

**Recommendation: (a) STAY-AS-IS** if D-GH1 + D-GH2 = SKIP; **(b) CONSOLIDATE PROACTIVELY** if either D-GH1 or D-GH2 lands. The consolidated pattern is the V2 default for providers with broad webhook surface (HubSpot, Shopify) — proven good UX. GitHub's webhook surface is similarly broad (60+ event types). The per-event-trigger pattern is V2's choice only for providers with narrow surface (Slack, Discord).

---

## 16. What happens after this audit is accepted

This audit is doc-only. After Marcus accepts:

1. **Default path: no implementation work.** The audit closes with the null-PORT recommendation. GitHub stays at V1-parity in V2 (already shipped).
2. **Conditional path: §15 decisions resolved.** Each accepted decision opens a corresponding implementation slice per §13. Each slice is its own audit (per phase-2-plan §6) — this audit doesn't pre-authorize implementation work for any §15 decision.
3. **CLAUDE.md gains a "GitHub parity" entry** alongside Stripe / Airtable / Sheets / Slack / Gmail / Notion / Excel / HubSpot parity entries, even on the null-PORT path. The entry documents: (a) V2 absorbed V1 surface 1:1 in Slice 14b, (b) §15 product-decision frontier remains open, (c) audit accepted on `<date>`.

The next provider audit in priority order is **Microsoft Outlook (mail)** (rank #12 per phase-2-plan §3) once GitHub parity closes — unless a higher-priority audit slot opens (e.g. Google Calendar / Drive / OneDrive / Outlook Calendar — on-demand per phase-2-plan §3.2). **Mailchimp is active in another chat — do not start.**
