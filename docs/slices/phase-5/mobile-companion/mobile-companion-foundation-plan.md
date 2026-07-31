# MOBILE-COMPANION-FOUNDATION-AUDIT-1 — Native Mobile Companion: Foundation Audit & Architecture Plan

**Type:** Audit + architecture plan (docs only — no production code in this batch).
**Date:** 2026-07-31.
**Supersedes:** [`docs/mobile/mobile-companion-app-plan.md`](../../../mobile/mobile-companion-app-plan.md)
(the 2026-era deferred scoping plan). That document's product scope survives; its core
data-access architecture is **rejected** here (§4).
**Status:** Plan of record for the permanent ChainReact native mobile application.
Nothing in this batch was pushed, deployed, or migrated.
**Owner decisions locked 2026-07-31 (MOBILE-COMPANION-M0-CONTRACTS-FOUNDATION-1):**
(1) a dedicated staging environment (**S0**) is now a hard prerequisite between M0
and M1 — see §24/§25; (2) the workflow-failure push recipient policy is final —
see §12; (3) `@chainreact/mobile-contracts` distributes via **GitHub Packages**
(immutable semver, pinned consumer versions) — see §9. M0 itself shipped the
contracts package with **zero runtime behavior**.

---

## 1. Product goal (plain language)

ChainReact users run business automations that fail at inconvenient times. The mobile
companion makes ChainReact trustworthy when the user is away from a desk:

> A workflow fails → the phone shows a native push → one tap opens the exact account,
> workflow, and run → the user sees a safe, humanized explanation of what went wrong →
> they pause, resume, disable, re-activate, or re-run it → the app shows the resulting
> state and the next run.

This is a permanent, first-class iOS + Android product surface — a real native
application (Expo/React Native development builds), **not** a PWA, WebView, Capacitor
wrapper, or repackaged website. Initial scope is monitoring, incident response,
workflow controls, notifications, usage summaries, integration-health summaries, and
basic role-aware account administration. Workflow authoring and the visual builder are
explicitly out of scope for the initial release.

---

## 2. Verified current-state inventory (citations)

Every claim below was verified against the working tree at commit `856af294f`
(v2-main, 2026-07-31).

### 2.1 Authentication — cookie-only, six parallel gates, zero bearer support

- All user-identity resolution is `supabase.auth.getUser()` with **no token argument**
  (cookie session only). There is no `Authorization: Bearer` path for user sessions
  anywhere in the repo.
- The gates: `requireUser` / `requireUserWithAccount` in
  `app/api/workflows/_shared.ts` (re-exported by `app/api/folders/_shared.ts`);
  a **second verbatim copy** of `requireUser` in `app/api/providers/_shared.ts`;
  `requireAccount` in `app/api/analytics/_shared.ts`; `requireAuthedUserId` and
  `requireOwnPersonalAccount` in `app/api/account/_shared.ts`;
  `requireInternalAdmin` in `app/api/internal/react-agent/_shared.ts`; plus inline
  `getUser()` gates (e.g. `app/api/runs/route.ts`).
- Supabase clients: SSR cookie client `utils/supabase/server.ts`; browser client
  `utils/supabase/client.ts`; Edge middleware client `utils/supabase/middleware.ts`
  (`updateSession`); service-role singleton
  `repositories/supabase/serviceRoleClient.ts` (`getServiceRoleClient(reason)`) — the
  sole service-role construction point, refuses to run in a browser.
- Four existing **non-user** bearer mechanisms (none verify a Supabase user JWT):
  customer API keys `crk_…` (`services/apiKeys/verify.ts`, consumed by
  `app/api/v1/workflows/[workflowId]/trigger/route.ts`), customer MCP tokens
  `crmcp_…` (`services/mcp/verify.ts`, consumed by `app/mcp/route.ts`), the cron
  shared secret (`services/cron/auth.ts` `requireCronAuth`), and the internal
  diagnostics token (`app/api/internal/diagnostics/_shared.ts` `applyDiagnosticsGate`).
- `middleware.ts` matches `/api/**`: every request gets a cookie-session
  read/refresh attempt, and a cookie-bearing MFA-enrolled AAL1 caller is 307-redirected
  to `/auth/mfa` for any non-allow-listed path (`services/auth/mfaChallengeGuard.ts`).
  A pure-bearer request carries no cookies, so `user` is null and the branch is skipped.
- Sign-in methods in code: email+password (+ Turnstile captcha) and signup OTP
  (`app/auth/actions.ts`), Google OAuth PKCE
  (`features/auth/GoogleSignInButton.tsx` → `signInWithOAuth`), callback
  `app/auth/callback/route.ts` (allow-list `["email","recovery"]` — magic links
  deliberately excluded), TOTP MFA (`app/api/account/mfa/*`,
  `app/api/auth/mfa/verify`), password reset. Sign-out is a **server action only**
  (`app/auth/actions.ts` `signOut`) — no REST logout endpoint.
- JWT claims are only ever read *after* `getUser()` validation
  (`core/auth/accessTokenClaims.ts` — "Never use this to establish identity").
  No custom claims; account id is never in the token.

### 2.2 Account model

- Types `personal | team | organization`, roles `owner | admin | member`, deletion
  status `active | pending_deletion` — `contracts/accounts.ts`. Tables
  `accounts` + `account_memberships`
  (`supabase/migrations/20260530000000_accounts_and_memberships.sql` and successors).
- Role gate: `services/accounts/accountAuthz.ts` `requireAccountRole`. Workflow access
  is **membership-based, not role-gated** (`requireWorkflowAccountMember`,
  `app/api/workflows/_shared.ts`); non-member collapses to 404
  (`workflowNotFoundResponse` — no existence leak). Private-credential workflows add
  `assertWorkflowRunEditAllowed` / `computeViewerCanRunEdit`.
- Active account is a **DB column** (`user_profiles.active_account_id`,
  migration `20260531000009`), resolved by
  `services/accounts/activeAccount.ts` `resolveActiveAccount(userId, {explicitAccountId})`
  with precedence explicit → stored → personal, self-healing stale pointers.
  **No route passes `explicitAccountId` today** — the seam exists and is unused.
- Removal from an account (`services/accounts/membership.ts` `removeMember`) revokes
  credential grants, deletes the membership, and clears a matching stored active
  account; the resolver self-heals on next request, so a removed member's cached
  account id becomes `not_member` → 403.
- Admin surfaces that exist as REST routes: account list/create (`/api/accounts`),
  switch active (`/api/account/active`), member list (any member) / remove / role
  change (`/api/accounts/[id]/members*`), invitations CRUD
  (`/api/accounts/[id]/invitations*`), leave + leave-impact, transfer-ownership,
  profile/password/MFA/notification-preferences (`/api/account/*`), account deletion.
  **Account rename has no backend** — no `PATCH /api/accounts/[id]`, no name-update
  repository function; `app/team/page.tsx` lists rename as "Deliberately NOT here".

### 2.3 Workflows, lifecycle, runs

- List `GET /api/workflows` (`app/api/workflows/route.ts`) → `WorkflowListItem`
  (`contracts/workflow.ts` `WorkflowListItemSchema`): state, providers, trigger/action
  counts, run stats. **No pagination.** Detail `GET /api/workflows/[id]` returns the
  **full `draftDefinition` graph** — heavy for mobile; no light projection exists.
- Workflow states (`contracts/workflow.ts` `WorkflowStateSchema`):
  `draft | active | paused | disabled | eligible_to_resume | deleted`; pure transition
  machine `core/workflows/lifecycle.ts` `TRANSITIONS`. `disabled → active` is
  forbidden — re-enabling is **two calls** (`/reactivate` then `/resume`).
- Lifecycle routes all POST under `app/api/workflows/[id]/…`:
  `activate`, `pause`, `resume`, `disable` (requires body `{reason}` from an
  ops-flavored 4-value enum), `reactivate`, `publish`, `restore` — all through
  `services/workflows/lifecycleOrchestrator.ts` via `runLifecycle`
  (`app/api/workflows/_shared.ts`). Destructive-action workflows return
  **409 `CONFIRMATION_REQUIRED`** with `confirmationText: "CONFIRM"` and an action
  list (`services/workflows/riskConfirmation.ts`); plan gates return 403
  (`services/workflows/planFeatureGate.ts`); readiness failures 422; trigger
  registration failures 502 with a redacted static message.
- `POST /api/workflows/[id]/run-now` (`app/api/workflows/[id]/run-now/route.ts`):
  full gate sequence (member → private-credential → state → frozen → 256 KiB cap →
  manual-trigger presence → plan → confirmation → readiness), enqueues a durable
  `status:'queued'` run (`services/execution/enqueue.ts` →
  `repositories/workflowRunsQueue.ts`), executes via `after(processQueuedRun(...))`
  with the every-minute `process-run-queue` cron as the durability net. Returns
  `202 {runId, enqueuedAt, isTest, triggeredBy}`.
- **Retry does not exist.** No route, service, or engine path.
  `triggered_by='retry'` is a declared-but-never-written enum value
  (`repositories/workflowRuns.ts`, CHECK constraint in migration
  `20260523000000`); `core/errors/failedRunCta.ts` documents "there is NO retry API
  to wire". There is also no cancel-run capability.
- Run history: account feed `GET /api/runs` (`app/api/runs/route.ts`) — but scoped by
  `ensurePersonalAccount`, **not** the active account (inconsistent with
  `/api/workflows`); `?limit` only (cap 200), no cursor, no server-side filters;
  includes `queued|running`. Per-workflow `GET /api/workflows/[id]/runs` —
  terminal-only, `?limit` (cap 100), no cursor.
- Run detail: only `GET /api/workflows/[id]/runs/[runId]` (no `/api/runs/[runId]`),
  and `repositories/workflowRuns.ts` `getById` filters out `queued|running` → a
  **non-terminal run 404s** from detail. Redaction seam
  `app/api/workflows/_runDtos.ts`: drops raw `triggerEvent` and `fatalError`
  entirely; step `output` exposed **only** to the run author on a test run, then
  redacted per `OutputMeta.sensitive` (`core/security/redactOutput.ts`); step errors
  humanized via `toSafeStepError`. Step statuses `succeeded | failed | skipped`.
- Failure humanization: engine classification
  (`services/execution/classifyHandlerError.ts` → `RunFailureCode`) →
  `core/errors/humanizeActionError.ts` (`HumanizedError {title, description, hint?,
  action?, severity}`, safe generic fallback) → persisted to
  `workflow_runs.error_classification` by
  `services/execution/runPersistence.ts` `classifyForPersistence` → served on every
  run DTO. CTA mapping `core/errors/failedRunCta.ts` (web hrefs; `retry_later` →
  `href: null`).
- `workflow_runs` billing/task-cost columns exist but are **not exposed on any DTO**.
  `authenticated` SELECT on `workflow_runs` was **revoked**
  (migration `20260701000000_revoke_authenticated_workflow_runs_select.sql`) — all
  reads are service-role + explicit route authorization.

### 2.4 Notifications

- Table `public.notifications` (migration `20260507000004`): **user-scoped (no
  `account_id` column)**, `type` enum (7 values: `workflow_failed`,
  `workflow_high_risk_activated`, `workflow_high_risk_run`, `account_invitation`,
  `api_key_created`, `api_key_revoked`, `integration_reconnect_needed`), severity
  `warning | error`, `action_url` (internal app path only), `metadata` jsonb,
  `read_at`. RLS select/update-own; inserts service-role only
  (`repositories/notifications.ts` `create`).
- **No REST API for notifications.** Web reads via server components
  (`app/notifications/page.tsx`) and mutates via server actions
  (`app/notifications/actions.ts` `markNotificationRead`,
  `markAllNotificationsRead`). The bell (`components/app-shell/NotificationBell.tsx`)
  is a render-time snapshot — no polling, no realtime.
- Failed-run fan-out: `services/execution/runPersistence.ts` `notifyOnFailure` →
  `services/notifications/notifyWorkflowFailure.ts` with an **atomic per-run dedup
  claim** (`repositories/workflowRuns.ts` `claimNotificationFanout` —
  status-guarded UPDATE on `error_notifications_sent_at`). It is error-isolated but
  **awaited inside `finalizeRun`**, i.e. on the engine's critical path.
- Recipient is `workflow.createdByUserId` — **the creator only**. On team accounts,
  owners/admins/other members get nothing. (Comment at `runPersistence.ts` — a known
  gap that push would amplify.)
- Channel abstraction exists with one implementation:
  `services/notifications/channel.ts` (`ChannelName` includes `"push"`-adjacent slots:
  `in_app | email | slack | discord | sms`), `channelRegistry.ts`
  `getEnabledChannelsForUser` hard-coded to `[inAppChannel]` and **ignores its
  `userId` param**. Only `workflow_failed` flows through the registry; the other
  writers call the repository directly.
- Notification preferences exist end-to-end (migration `20260605000002` →
  `contracts/notificationPreferences.ts` → `GET/PATCH
  /api/account/notification-preferences` → `features/account/NotificationsSection.tsx`)
  but are **inert** — no delivery path reads them.
- `integration_reconnect_needed` is one-shot by construction
  (`repositories/integrations.ts` `markNeedsReconnect` first-mark semantics).
- Deep-link gap: the most common failure notification's
  `action_url` is `/workflows/{id}?historyRun={runId}`, but
  `app/workflows/[id]/page.tsx` **does not read `historyRun`** — the param is dead.
  Notification `metadata` (`{workflowId, workflowName, runId}`) is the reliable
  routing source.
- **Push/device infrastructure: none.** No device-token table, no registration route,
  no FCM/APNs/Expo/web-push code. Transactional email exists
  (`services/email/sendTransactionalEmail.ts`, Resend transport) with only
  team-invitation and account-deletion templates — no failure email.
- **Supabase Realtime usage: zero** across the source tree; no realtime publication
  configured for any table.

### 2.5 Usage, billing, integration health

- Usage lives on `account_billing` (tasks + AI credits + plan + Stripe ids);
  `repositories/accountBilling.ts` `getUsage()` is an explicit non-secret column
  projection. **`GET /api/account/usage`**
  (`app/api/account/usage/route.ts`) already returns the mobile-ideal shape:
  `AccountUsageSummary` (`core/billing/accountUsageSummary.ts`) with per-dimension
  `{available, used, limit, remaining, percentUsed, nearLimit, overLimit, resetsAt}`,
  fail-open per dimension, no Stripe ids. (`GET /api/ai/usage` is
  personal-account-pinned — do not build mobile on it.)
- Plan tiers/limits: `core/billing/planPolicy.ts` (locked PRICING-LOCK-1);
  plan/status summary only via owner/admin route
  `GET /api/accounts/[id]/billing/subscription`
  (`services/billing/subscriptionCancellation.ts` `AccountSubscriptionState`, no
  Stripe ids). No single combined billing summary endpoint.
- Integration health: no stored health column; the only persisted signal is
  `integrations.needs_reconnect_at`. Pure derivation exists
  (`services/integrations/connectionDiagnosis.ts`, `ConnectionStatus` taxonomy) and a
  **safe DTO contract already exists**: `contracts/apps.ts`
  (`AppCatalogItemSchema` / `AppAccountSummarySchema` — booleans only, "NO encrypted
  tokens, NO provider account ids, NO raw account metadata, NO granted-scopes list",
  pinned by `tests/unit/app/apps/_shared-dto-safety.test.ts`). But `/apps` is a
  **server component with no REST equivalent** (`app/apps/page.tsx` →
  `app/apps/_shared.ts` `resolveAppCatalog`). Direct client reads of `integrations`
  are already impossible: `authenticated` SELECT revoked (V2-READY-47B/47D).
- Rate limiting exists only for the public surfaces (API-key trigger, MCP, connected
  analytics — durable Postgres fixed-window, e.g. `services/apiKeys/rateLimit.ts`).
  **Session-authenticated routes have no rate limiting.**

### 2.6 Contracts, serialization, packaging

- `contracts/` = 41 files, ~8,000 lines, zod-only except **one impurity**:
  `contracts/vehicleSuggestions.ts` imports `@/core/resourceLinks/linkHealth`
  (type-only). The 50-file leaf cap (`scripts/check-leaf-folder-counts.mjs`) leaves 9
  slots — a mobile package must not be flat files in `contracts/`.
- Route pattern: zod at the **input** boundary only; responses are hand-built by named
  mappers (`toWorkflowListItem`, `toWorkflowRunDetail`, `toAppCatalogItem`,
  `toRunListItem`); **no route validates output against a schema**. No route returns a
  repository row directly. Best no-leak seams: `app/api/workflows/_runDtos.ts` and
  `services/mcp/tools/serialize.ts` (pure allow-list DTO builders with
  header-documented exclusion contracts).
- Packaging: single private npm package (`chainreact-v2`), **no workspaces**, sharing
  via `@/*` path alias. Precedent for a self-contained subfolder with its own
  tsconfig + build script + gitignored `dist` exists twice: `scripts/mcp/` and
  `scripts/chainreact/`.
- Versioning precedent: `/api/v1` (one route, API-key-auth, flag-gated dark,
  header documents the charter) and exported schema-version constants
  (`AI_GUIDANCE_SCHEMA_VERSION = 1` idiom). No HTTP deprecation pattern exists yet.
- Error envelope: cookie surface `{error, code?, details?}` with stable
  SCREAMING_SNAKE codes and deliberate no-leak collapses (404 for non-members, fixed
  strings for 500s); public v1 surface uses a different `{ok, error, code?}` envelope.
- Test conventions: route tests `tests/unit/app/api/**` (`@jest-environment node`,
  mock service/repo seams); DB RLS tests `tests/integration/security/` (opt-in via
  `ALLOW_DB_INTEGRATION_TESTS`); structure locks `tests/structure/`
  (`api-route-authorization.test.ts` requires recognized auth tokens on mutating
  routes); no-leak patterns: sensitive-marker deep-serialize scans, hostile-string
  matrices, field-allow-list pinning; generic net `scripts/mcp/tools/noLeakScanner.ts`.

### 2.7 Environment posture

- **One Supabase project serves dev and production** (`.env.example` invariant lines;
  `docs/PROJECT_MEMORY.md` "still ONE Supabase project → treat `db:push` as
  prod-impacting"; `docs/roadmap/chainreact-v2-roadmap.md` "every deploy is
  production"; staging is an accepted, deliberately deferred risk per owner decision
  2026-07-03). Deploys: Vercel from `v2-main` → `https://chainreact.app`;
  11 cron jobs in `vercel.json`.
- New-table rule: `docs/rules/database-security.md` + `npm run lint:migrations`
  (`scripts/check-migration-rls.mjs`) — same-migration RLS + explicit GRANTs + audit
  columns + unique 14-digit version + forward-only. Exemplar:
  `supabase/migrations/20260811000000_workflow_live_test_sessions.sql`.

---

## 3. Decisions retained from previous planning

From `docs/mobile/mobile-companion-app-plan.md`:

1. **Companion, not port.** Monitoring + incident response + controls + push; the
   React Flow canvas stays web-only. Retained.
2. **The signature incident-response journey** (fail → push → tap → run → act). Retained.
3. **Push scoped narrow in v1**: workflow failures + already-existing critical events
   only; no preference center, no alert-rule builder, no marketing pushes. Retained.
4. **All mutations through existing routes/orchestrators** — never duplicate
   lifecycle, billing, or authorization client-side. Retained and hardened (§7).
5. **Run detail must be server-redacted; raw `integrations` rows must never reach a
   device.** Retained — now structural (§4.1).
6. **Expo + TypeScript + Expo Router** as the app platform. Retained, upgraded to a
   production posture (development builds, EAS) in §19.

## 4. Decisions changed, and why

### 4.1 REJECTED: hybrid data access (direct Supabase SDK table reads + realtime)

The prior plan's core decision — mobile reads `workflows`, `workflow_runs` summaries,
and `notifications` straight from Supabase via the native SDK — is rejected.

- **It is already impossible for two of the three tables.** `authenticated` SELECT on
  `workflow_runs` was revoked (migration `20260701000000`) and `integrations` likewise
  (V2-READY-47B/47D). The web moved to service-role reads + explicit route
  authorization *after* that plan was written. The plan is stale, not merely risky.
- **It fossilizes table shapes into shipped binaries.** A phone app version survives
  for months; a direct table read makes every column rename an app-breaking change.
  The account-cutover migration (`20260530000004` dropped `workflow_runs.user_id`)
  would have bricked shipped clients.
- **It bypasses server redaction** — the exact class of bug the run-detail seam
  (`_runDtos.ts`) exists to prevent.
- **Replacement:** every mobile read and write goes through `/api/mobile/v1`
  versioned DTOs (§8). The native app never sees a repository row.

### 4.2 CHANGED: realtime — not in v1

The prior plan proposed enabling Supabase realtime publications on `workflow_runs` +
`notifications`. Deferred out of v1: zero realtime exists today (§2.4), publications
on raw tables leak unstable shapes (same argument as §4.1), and the signature journey
does not need it — push is the wake-up signal, and TanStack Query refetch
(on-focus + short polling on the run-detail screen) covers "state updates in the
app". §16 records the re-entry condition: if post-v1 latency proves insufficient,
realtime ships only via dedicated mobile-safe projection tables, never raw rows.

### 4.3 CHANGED: contracts sharing — packaged subfolder, not monorepo/workspace

The prior plan floated "extract `contracts/` into a shared workspace package
(monorepo/pnpm workspace)". Rejected: no monorepo migration of the live production
web repo merely to add mobile. Replacement (§9): `packages/mobile-contracts/` — a
self-contained subfolder package in ChainReactV2 following the proven
`scripts/mcp/tsconfig.json` build pattern, consumed by the mobile repo via git
reference. The web app is untouched.

### 4.4 CHANGED: bearer shim location

The prior plan said to extend `requireUser()` in `app/api/providers/_shared.ts`,
described as "the shared auth gate used by all routes". That is factually wrong —
it is one of **six** gates and serves only the providers namespace (§2.1). Threading
bearer support through six duplicated gates widens drift risk on the production web
surface. Replacement: one new, dedicated mobile gate in
`app/api/mobile/v1/_shared.ts` (§10); the six web gates are untouched.

### 4.5 CHANGED: push provider decision is made deliberately, not by "simplest"

The prior plan picked "Expo Push API (simplest)". §12 makes the decision on
ownership/reliability/operational grounds — the conclusion is still Expo Push Service
for v1, but behind a provider abstraction that keeps direct APNs/FCM reachable
without touching workflow services.

### 4.6 CHANGED: notifications read path

Prior plan: mobile reads the `notifications` table directly via SDK. Replaced by
`/api/mobile/v1/notifications` read models (§8) for the same reasons as §4.1 — and
because the table is user-scoped with no `account_id`, so account-context filtering
belongs server-side.

---

## 5. Final repository topology

| Repo | Contents | Pipeline |
|---|---|---|
| **ChainReactV2** (existing, production) | Web app, all backend routes incl. `/api/mobile/v1`, engine, migrations, **`packages/mobile-contracts/`** | Vercel deploy from `v2-main` (unchanged) |
| **ChainReactMobile** (new sibling repo) | Expo/React Native app only | EAS Build / EAS Submit / EAS Update channels; independent release + rollback |

- No monorepo migration. Web and mobile have independent build, dependency, release,
  and rollback pipelines by construction.
- The current structure supports this cleanly: the backend is already
  service/route-shaped with no web-client coupling in the API layer, and the
  subfolder-package precedent exists (§2.6). The one coupling point is the contracts
  package, versioned by git tag (§9).
- ChainReactMobile is created by Marcus (GitHub org repo) — listed in §22.

## 6. Final client/server/data boundaries

```
ChainReactMobile (Expo)
  │  bearer: Supabase access token (user session)
  ▼
/api/mobile/v1/*  (ChainReactV2 — versioned mobile contract)
  │  gate: verify JWT → membership → explicit account scope
  │  egress: zod .parse() against @chainreact/mobile-contracts schemas
  ▼
Existing services / orchestrators (lifecycle, billing gates, notifications, usage,
  app catalog, run DTO redaction)  ── the ONLY place business rules live
  ▼
Repositories → Supabase (service-role, RLS + explicit account predicates)
```

Hard rules:

- The mobile app never holds a service-role key, never queries tables, never
  subscribes to raw rows, and never receives a repository row type.
- The mobile layer duplicates **no** lifecycle, billing, authorization, integration,
  or engine behavior. Mutation routes are thin delegations to
  `LifecycleOrchestrator` / `run-now` machinery / account services.
- Every `/api/mobile/v1` response is `.parse()`d against its published schema before
  send — the contract is enforced, not documented (net-new discipline; today no route
  validates egress, §2.6).

## 7. Mobile v1 scope and explicit non-goals

**In scope (v1):** email/password + Google sign-in (+ TOTP MFA step where enrolled);
personal/team/organization account switching; workflow list + light workflow detail;
account-wide and per-workflow run history (including queued/running); redacted run
detail with step statuses and humanized failure explanation; lifecycle controls
(activate incl. CONFIRM flow, pause, resume, disable, reactivate→resume, run-now);
in-app notifications feed + mark read/all-read; native critical push (workflow
failures + integration-reconnect-needed) with deep links; task + AI-credit usage
summary; safe integration-health summary; member list (any member) and role-aware
member remove/role-change/invite (owner/admin) — exactly the admin the backend
already supports.

**Explicit non-goals (v1):**

- Workflow creation, visual editing, or any React Flow canvas recreation
- Arbitrary workflow configuration editing
- WebView/wrapped-web surfaces of any kind
- **Retry of a failed run** — the backend has no retry (§2.3). Mobile ships "Run
  again" only as a plain run-now on manual-trigger workflows, labeled as a new run.
  True retry (reusing the failed run's trigger event) is a backend feature first
  (§24, deferred batch).
- Run cancel (no backend), account rename (no backend), OAuth
  integration connect/reconnect *flows* on device (health summary links out;
  reconnect is a web journey in v1)
- Marketing notifications, notification-rule builder, HITL approvals (no backend)
- Realtime subscriptions (§4.2), offline mutation queueing (§17)
- Analytics dashboards (web surface; usage summary only on mobile)

## 8. `/api/mobile/v1` endpoint matrix

Conventions for the whole namespace: bearer auth (§10); **explicit account scoping**
— account-scoped endpoints carry `{accountId}` in the path and the gate verifies
membership via the existing `resolveActiveAccount(userId, {explicitAccountId})` /
`requireAccountRole` seams; mobile **never mutates** `user_profiles.active_account_id`
(the web's switcher state is not per-device state); error envelope `{error, code?,
details?}` reusing the lifecycle code map (§2.6); cursor pagination
(`?cursor=&limit=`, keyset on `started_at,id` — net-new, the web has no cursors);
non-member and not-found collapse to 404 (existing no-leak posture); every response
`.parse()`d against `@chainreact/mobile-contracts`; whole namespace behind
`ENABLE_MOBILE_API` (default OFF → 404, `services/apiKeys/flags.ts` pattern);
durable Postgres fixed-window rate limiting per user + per device (reuse the
`services/apiKeys/rateLimit.ts` pattern — net-new for session-shaped auth, §2.5).

| # | Endpoint | Method | Backing (existing code) | Notes |
|---|---|---|---|---|
| 1 | `/api/mobile/v1/app-config` | GET | new (static + env) | `minSupportedVersion`, `latestVersion`, `forceUpdate`, feature flags. Unauthenticated, cacheable. |
| 2 | `/api/mobile/v1/session` | GET | `getUser` + `listUserAccountSummaries` + `resolveActiveAccount` | User identity, accounts with roles/types/frozen flags, suggested default account. |
| 3 | `/api/mobile/v1/session/logout` | POST | `supabase.auth.admin.signOut(jwt)` / SDK signOut | Revokes refresh-token family; net-new (no REST logout exists). |
| 4 | `/api/mobile/v1/accounts/{accountId}/workflows` | GET | `workflowsRepo.listByAccount` + `toWorkflowListItem` + `getStatsForAccount` | Adds cursor pagination + optional `state` filter. |
| 5 | `/api/mobile/v1/accounts/{accountId}/workflows/{workflowId}` | GET | new light projection over `getById` (NO `draftDefinition`) | Summary + node id→displayName map (for step labeling) + disabled reason/context. |
| 6 | `/api/mobile/v1/accounts/{accountId}/runs` | GET | `listByAccountForDisplay` + `toRunListItem` | **Explicit-account scoped (fixes the personal-account pinning of `/api/runs`)**; cursor; server-side `status`/`workflowId` filters (net-new). |
| 7 | `/api/mobile/v1/accounts/{accountId}/workflows/{workflowId}/runs` | GET | `listByWorkflow` variant **including non-terminal** | Cursor; status filter. |
| 8 | `/api/mobile/v1/accounts/{accountId}/workflows/{workflowId}/runs/{runId}` | GET | `toWorkflowRunDetail` + a non-terminal-tolerant fetch | **Must serve `queued`/`running`** (today's `getById` 404s them, §2.3) — status-only steps while in flight; step outputs NEVER exposed on mobile (stricter than web: even own-test-run outputs are withheld in v1). |
| 9 | `/api/mobile/v1/notifications` | GET | `notificationsRepo.listForUser` + preview mapper | Cursor; unread count; per-item `{id,type,severity,title,body,readAt,createdAt, target:{workflowId?,runId?,screen}}` — target derived from `metadata`, not `action_url` (dead `historyRun` param, §2.4). |
| 10 | `/api/mobile/v1/notifications/{id}/read` | POST | `markRead` | |
| 11 | `/api/mobile/v1/notifications/read-all` | POST | `markAllReadForUser` | |
| 12 | `/api/mobile/v1/accounts/{accountId}/integration-health` | GET | `resolveAppCatalog` → `contracts/apps.ts` DTOs | Reuse `AppCatalogItemSchema` verbatim (already safe + test-pinned). |
| 13 | `/api/mobile/v1/accounts/{accountId}/usage` | GET | `computeAccountUsageSummary` (`/api/account/usage` brain) | Optionally merged with plan/status from `AccountSubscriptionState` for owner/admin callers. |
| 14–18 | `…/workflows/{workflowId}/activate · pause · resume · disable · reactivate` | POST | `runLifecycle` + `LifecycleOrchestrator` | Identical semantics incl. 409 CONFIRMATION_REQUIRED, 422 readiness, 403 plan/frozen, 502 redacted. Disable body gains a user-facing reason mapped to `manual_admin`. |
| 19 | `…/workflows/{workflowId}/run-now` | POST | the run-now route's service path | Same gates; 202 `{runId}`. |
| 20 | `/api/mobile/v1/devices` | POST | new (§12) | Register/refresh push token (idempotent upsert on token). |
| 21 | `/api/mobile/v1/devices/{deviceId}` | DELETE | new (§12) | Logout/disposal unregister. |
| 22 | `/api/mobile/v1/accounts/{accountId}/members` (+ `/{userId}` PATCH/DELETE, `/invitations` GET/POST/DELETE) | — | `membership.ts`, `invitations.ts`, `accountAuthz` | Thin delegations; role checks server-side as today. |

**Retry endpoint: deliberately absent** until the backend feature exists (§7).
**Deep-link resolution endpoint: not needed** — push payloads carry typed ids (§13)
and the app routes locally; #8/#9 are the resolvers.

## 9. Mobile-safe contract package — `@chainreact/mobile-contracts`

- **Location:** `packages/mobile-contracts/` in ChainReactV2 (new top-level leaf —
  keeps the 41/50 `contracts/` leaf and `lint:structure` safe).
- **Build:** own `tsconfig.json` copied from the proven `scripts/mcp/tsconfig.json`
  pattern (`declaration: true`, RN/Metro-friendly module settings, `outDir: dist`
  gitignored); `npm run mobile-contracts:build` beside `mcp:build`. Root tsconfig
  keeps typechecking the sources.
- **Content:** zod schemas + inferred types for every §8 request/response, the error
  envelope + code union (lifted from `lib/api/workflows.ts` `WorkflowApiErrorCode`
  incl. `CONFIRMATION_REQUIRED` detail shape), push payload schema (§13), deep-link
  target schema, and `MOBILE_CONTRACTS_SCHEMA_VERSION = 1` (existing
  schema-version-constant idiom). Wherever a safe web contract already exists it is
  **re-exported, not re-authored** (`WorkflowListItemSchema`, `RunListItemSchema`,
  `WorkflowRunSummary/DetailSchema`, `HumanizedErrorSchema`, `AppCatalogItemSchema`,
  `AccountTypeSchema`, `MembershipRoleSchema`, usage summary schema). `zod` is a
  peer dependency.
- **Must never contain:** repository row types, service-role concepts, OAuth/token
  fields, provider secrets, raw provider responses, unredacted trigger payloads or
  run outputs, server-only config. Enforced two ways: (a) the re-export barrel is the
  machine-readable allow-list, backed by a structure test that fails if it ever
  re-exports from denylisted contract files (`integration.ts` wholesale,
  `opsAlert.ts`, `internalReactAgent.ts`, `triggerEvent.ts`, …); (b) a purity
  structure test asserting `packages/mobile-contracts/**` imports only `zod` +
  `contracts/*` siblings. **Pre-work:** inline the one `contracts/` impurity
  (`vehicleSuggestions.ts` → `core/resourceLinks/linkHealth`) or exclude that file.
- **Versioning & consumption (LOCKED 2026-07-31 — supersedes the earlier git-tag
  proposal):** the package is a real private package published to **GitHub
  Packages** under the ChainReact organization. Semantic versions; **published
  versions are immutable** (a bad release is superseded, never mutated);
  ChainReactMobile **pins an exact version** (no ranges, no mutable `latest` in
  production builds); git dependencies are NOT a supported distribution
  mechanism; local development uses a `file:` path or a packed tarball
  (`npm run mobile-contracts:pack`). Publication flow, CI gates, org-managed
  Actions credentials, and rollback:
  [`packages/mobile-contracts/PUBLISHING.md`](../../../../packages/mobile-contracts/PUBLISHING.md).
  Not published in M0 — publish-ready only. Contract compatibility tests live in
  **both** repos (§23):
  the web repo parses fixture responses of every mobile route against the package;
  the mobile repo runs the same fixtures against its client decoders.

## 10. Authentication & session design

- **Sign-in on device:** native Supabase SDK (`signInWithPassword`;
  `signInWithOAuth` Google via `expo-web-browser` + PKCE deep-link callback
  `chainreact://auth/callback` registered in the Supabase dashboard; TOTP MFA
  challenge screen mirroring the web's `aal` model). Turnstile is a web-form
  bot defense — the native password grant path does not send it; abuse resistance
  for mobile sign-in comes from Supabase auth rate limits + our namespace rate
  limiting; revisit if abuse appears.
- **Storage:** access + refresh token via a Supabase SDK storage adapter backed by
  `expo-secure-store` (Keychain/Keystore). Nothing session-related in AsyncStorage.
- **Refresh:** owned by the Supabase SDK on device (`autoRefreshToken`), foregrounded
  on app-state changes. The server refreshes nothing for bearer callers (middleware
  refresh is cookie-only, §2.1) — this matches the design.
- **Server verification (`app/api/mobile/v1/_shared.ts`, the single new gate):**
  1. Extract `Authorization: Bearer <jwt>`; verify with
     `getServiceRoleClient("mobile-v1 auth").auth.getUser(jwt)` — server-side
     verification, **never trusting decoded claims** (repo rule,
     `core/auth/accessTokenClaims.ts` posture).
  2. Resolve account scope from the **path** `{accountId}` through
     `resolveActiveAccount(userId, {explicitAccountId})` — membership + frozen checks
     with the existing self-healing; `not_member` → 404 (no existence leak),
     `account_frozen` → 403 `ACCOUNT_PENDING_DELETION`.
  3. Authorization = explicit `account_id` predicates in service/repo calls (the
     established post-RLS-revocation posture, §2.3) — RLS does not bind for
     service-role reads and the routes must not pretend it does.
  4. AAL: where an endpoint is sensitive enough to require step-up (none in v1's
     matrix — member admin is role-gated, not AAL-gated, matching web), the gate
     reads `readAccessTokenClaims(jwt).aal` **after** verification, mirroring
     `requireDeletionStepUpSession`.
  5. The gate never reads cookies; tests copy the v1-trigger pattern of **not**
     mocking the SSR client so a cookie dependency can never sneak in.
- **Account switching:** client-side selection of which `{accountId}` to call —
  no server mutation, no cross-surface interference with the web's stored active
  account (§4.4 rationale; the web column is shared global state).
- **Removed-while-open:** next request under the removed account → 404/403 from the
  membership check (removal already clears grants + stored pointers, §2.2); client
  maps to "You no longer have access", drops to account list, refetches `/session`.
- **Expired session:** SDK refresh fails → local sign-out → login screen; API 401s
  map to the same path.
- **Logout:** SDK `signOut()` (revokes refresh token) + `DELETE /devices/{id}` to
  drop the push token; `/session/logout` (server-side revocation) covers
  remote/lost-device disposal from another session.
- **MFA/recovery parity:** TOTP enroll/manage stays on web in v1; mobile handles the
  challenge at sign-in. Password reset links out to the web flow (`/auth/callback`
  allow-list unchanged).

## 11. Account & role behavior

- Account list + roles from `/session` (`listUserAccountSummaries` — read-only,
  never self-heals, correct for display). Personal/team/organization labels reuse the
  web's `TYPE_LABEL` semantics (`components/app-shell/useAccountSwitcher.ts`).
- Role gates are enforced server-side per existing services: member list = any
  member; remove/role-change/invite = owner/admin (`requireAccountRole`); owner never
  a removal/demotion target; leave refuses sole owner (`SOLE_OWNER_MUST_TRANSFER`).
  Mobile renders capability from the response (e.g. `canManage` flags), never
  computes it from role names client-side.
- Frozen (pending-deletion) accounts render read-only with the existing
  `ACCOUNT_PENDING_DELETION` message; workflow controls disabled.

## 12. Push architecture

**Provider decision — Expo Push Service for v1, behind an owned abstraction.**
Grounds (not implementation speed): (a) *ownership/portability* — a
`PushProvider` interface (`services/notifications/push/provider.ts`: `send(batch)`,
`fetchReceipts(ids)`) is the only place Expo appears; direct APNs/FCM is a provider
swap, not a rearchitecture. (b) *operational burden* — direct APNs/FCM means
managing APNs JWT signing + FCM OAuth, per-platform batching, and receipt semantics
inside Vercel serverless functions; Expo Push wraps both with a receipts API and
invalid-token signals, and EAS is already the build/credential system (§19), so it
adds no new vendor. (c) *reliability/observability* — delivery receipts + ticket
errors are first-class and feed token cleanup. (d) *scale* — batch API (100/request)
is far beyond v1 volume. Re-evaluate at sustained high volume or if Expo Push SLAs
become the bottleneck; the abstraction is the exit.

**Data model — `mobile_push_devices` (new migration, per
`docs/rules/database-security.md`):** `id uuid PK`, `user_id → auth.users ON DELETE
CASCADE`, `platform CHECK ('ios','android')`, `expo_push_token text UNIQUE`,
`device_label text` (model, user-visible name), `app_version text`,
`last_seen_at timestamptz`, `disabled_at timestamptz` (invalid-token tombstone),
`created_at/updated_at` + `set_updated_at` trigger; RLS enabled with **deny-all
client policy** (service-role only, `workflow_live_test_sessions` exemplar) + explicit
GRANTs to `service_role` only; forward-only; RLS/GRANT tests in
`tests/integration/security/`. **User-scoped, not account-scoped**: a device belongs
to a person; account targeting resolves at send time from memberships — this matches
the user-scoped `notifications` table and avoids duplicate registrations per account.

**Registration lifecycle:** register/refresh on login and token rotation
(`POST /devices`, idempotent on token; re-registration by another user re-parents the
token); unregister on logout/disposal (`DELETE /devices/{id}`); receipts marking
`DeviceNotRegistered` set `disabled_at`; a periodic cron sweep purges tombstones and
stale `last_seen_at` rows. User deletion cascades. Account removal needs no device
change (targeting is resolved per event).

**Delivery path:**

1. `getEnabledChannelsForUser` (`channelRegistry.ts`) becomes real: reads
   `notify_workflow_alerts` (finally un-inerting the preference, §2.4) and returns
   `[inAppChannel, pushChannel]` accordingly. `"push"` joins `ChannelName`.
2. `pushChannel.send` **enqueues** a delivery job and returns — it never awaits
   provider I/O inside run finalization. v1 mechanism: reuse the durable-queue
   pattern — a `push_deliveries` row (or a jsonb payload on the device row's queue
   table) written in the same service call, drained by `after()` + an every-minute
   cron (`process-run-queue` precedent) so push survives serverless termination and
   **workflow finalization is never blocked** beyond one local INSERT. Failure
   isolation: the existing try/catch around `notifyWorkflowFailure` stays; a push
   outage degrades to in-app only.
3. Idempotency: the existing atomic `claimNotificationFanout` already guarantees
   one fan-out per run; the delivery job id is `(notificationId, deviceId)`-unique so
   cron retries cannot double-send.
4. Payload (schema in the contracts package): `title`/`body` from the existing
   no-leak builders (`buildPlainTextBody` already guards raw text), and
   `data: {v: 1, type, accountId, workflowId?, runId?, notificationId}` —
   **identifiers and presentation text only**; never tokens (the `account_invitation`
   raw-token deep link is exactly why invitation pushes are out of v1), never
   provider payloads, never step errors.

**v1 push events (from §2.4 candidates):** `workflow_failed` (severity `error`;
per-run deduped) and `integration_reconnect_needed` (one-shot by construction).
High-risk audit + API-key events stay in-app only (actor = recipient).

**Workflow-failure recipient policy (LOCKED by Marcus, 2026-07-31):**

- **Personal account:** the account owner.
- **Team / organization account:** the workflow **creator** (only while still an
  active account member) **plus all current account owners and admins**.
- Every recipient must have **workflow alerts enabled**
  (`notify_workflow_alerts`); recipients qualifying through multiple rules are
  **deduplicated**; removed/former members are **never** notified; ordinary
  members do **not** receive every workflow failure by default.
- Per-workflow followers/subscriptions are the deferred long-term granular
  model (not v1).
- **M3 implements this as a dedicated recipient-resolution service** (pure
  resolution + focused tests: each rule, dedup, removed-member exclusion,
  preference gating) — not inline in the engine or the channel registry, and
  not in M0 (which is behavior-free).

**App-side behavior:** `expo-notifications` handlers for foreground (in-app banner +
badge/query invalidation), background/terminated (system tray), and cold start
(`getLastNotificationResponseAsync` → route). Android notification channel
"Workflow alerts" (high importance); iOS standard alerts (no critical-alert
entitlement — we don't qualify).

## 13. Deep-link contract

- **Custom scheme** `chainreact://` (auth callback + push routing) and **universal
  links / app links** on `https://chainreact.app` for a small allow-listed path set
  (`/workflows/{id}`, `/notifications`) so existing web URLs open the app when
  installed. Requires `apple-app-site-association` + `assetlinks.json` served by the
  web app (small ChainReactV2 addition) and associated-domain entitlements.
- **Canonical in-app targets** (schema in contracts package):
  `run-detail {accountId, workflowId, runId}` · `workflow-detail {accountId,
  workflowId}` · `notifications {}` · `integration-health {accountId}`. Push taps
  route from `data`, **never** by parsing `action_url` (dead `historyRun` param,
  §2.4).
- **Tamper posture:** a deep link is a *navigation hint, never an authority*. Every
  target resolves through authed §8 endpoints; a link into an account the user can't
  access yields the standard 404 → "not available" screen. Cold-start links queue
  until the session is established.

## 14. Security threat model

| Threat | Mitigation |
|---|---|
| Stolen device | Tokens in Keychain/Keystore (`expo-secure-store`), OS-level device credential; remote revocation via `/session/logout` from web + Supabase session revocation; short-lived access tokens (Supabase default) limit the window |
| Rooted/jailbroken device | No secrets beyond the user's own session; no service-role material on device ever; no root-detection theater in v1 (documented residual risk) |
| Session-token storage | SecureStore only; never AsyncStorage/logs/crash reports; memory-only in JS runtime |
| Sensitive data in logs | Mobile logger with a redaction wrapper; crash reporter (§19) configured `sendDefaultPii: false`, breadcrumbs scrubbed of auth headers + query strings; server side unchanged (existing no-leak posture) |
| Screenshots / app-switcher preview | v1 data is already redacted-by-contract (no step outputs on mobile, §8 #8); no blur overlay in v1 — revisit if outputs ever ship |
| Lock-screen push content | Title/body from no-leak builders only (workflow name + humanized headline); iOS previews follow user's system setting |
| Deep-link tampering | Links are hints, not authority (§13); no tokens in links; account access re-verified server-side per request |
| Cross-account access | Path-explicit `{accountId}` + server membership check on every call; non-member → 404; removal self-heals (§2.2); no account state cached across switches without keying the query cache by accountId |
| Old app versions | Versioned frozen `/v1` contract + additive evolution + min-version gate (§18) |
| Replay of control requests | TLS everywhere; bearer JWT expiry; mutations are idempotent-or-guarded server-side already (state machine 409s, run-now enqueue idempotency); no additional nonce layer in v1 |
| Compromised push token | Tokens map to devices, not sessions; push payloads contain no secrets (ids + presentation text only); re-registration re-parents; receipts + sweep disable dead tokens |
| Device disposal / logout | SDK signOut (refresh-token revocation) + device row deletion; `/session/logout` for remote |
| Unredacted run data | Structurally impossible via contract: mobile run detail never includes step outputs, trigger events, or fatal errors; egress `.parse()` + no-leak marker tests + `scanForLeaks` net |
| Offline caches | §17 — TanStack Query cache memory-only in v1 (no persistence plugin); SecureStore holds tokens only |
| Analytics / crash data | Crash reporting only (no product analytics SDK in v1); PII scrubbing config; EU/US data residency chosen at account setup |
| TLS / endpoint config | API base URLs compiled per EAS environment (§19); no user-editable endpoint; ATS/cleartext disabled |
| Debug builds vs production | Dev builds point at dev config by build profile; **until a staging environment exists this is the top environment risk** (§19, §25) — internal dev builds hit production data by definition today |

**Local persistence policy:** *May persist:* session tokens (SecureStore only),
device/push registration id, UI preferences, last-selected accountId. *Memory-only:*
all API response data (workflows, runs, notifications, usage, health), the push
payload after routing. *Never on device:* provider data, step outputs, other
members' PII beyond what member-list DTOs return, service credentials of any kind.

## 15. Database & migration plan

Exactly **one** new table for v1 — `mobile_push_devices` (§12), plus (if the queued
delivery variant is chosen) `mobile_push_deliveries`; both follow
`docs/rules/database-security.md` in full (same-migration RLS with deny-all client
policies, explicit GRANTs to `service_role` only, audit columns + triggers, unique
14-digit versions, forward-only, `npm run lint:migrations`, RLS tests in
`tests/integration/security/`). No changes to existing tables. **Applying them is
prod-impacting** (single Supabase project, §2.7) — each lands only with Marcus's
explicit per-batch approval, and ideally after the staging decision (§25).

## 16. Realtime decision

**No realtime in v1** (§4.2). Freshness model: push as the wake signal; TanStack
Query `refetchOnAppFocus` + short-interval polling only on the run-detail screen
while a run is `queued|running` (bounded by the namespace rate limits). Re-entry
condition, recorded now: if post-v1 usage shows the polling window is materially
worse than live updates, realtime ships **only** as narrowly-scoped subscriptions on
new mobile-safe projection tables (summary columns only, RLS-scoped), never on
`workflow_runs`/`notifications`/`integrations` raw rows.

## 17. Offline / cache policy

Read-only offline: previously-fetched screens render from the in-memory cache with a
staleness banner; no query-cache persistence to disk in v1 (§14 policy). **No offline
mutation queueing** — a control action taken offline fails fast with "You're
offline"; queued lifecycle mutations against a moving state machine create
wrong-state 409 storms and false user confidence. Pull-to-refresh everywhere;
`app-config` and session revalidate on foreground.

## 18. Backward-compatibility policy

- **`/api/mobile/v1` is frozen at first mobile store release:** breaking changes
  (removing/renaming fields, changing semantics) require `/v2`; additive optional
  fields are allowed and clients must ignore unknown fields (zod `.passthrough()` on
  client decoders / non-strict parse).
- **Min supported version:** `app-config` returns `minSupportedVersion` (semver) +
  `forceUpdate`; the app checks at launch/foreground. Server compatibility window:
  a released mobile version is supported ≥ 6 months or until a security issue forces
  the reserved force-update path (the only sanctioned use).
- **Deprecation:** endpoint/field deprecations announced in the contracts package
  CHANGELOG + a `deprecated: true` marker in `app-config` capabilities; removal only
  at a major version.
- **Old client vs newer backend:** unknown-field tolerance + stable error codes mean
  old clients degrade gracefully; new enum values must ship behind additive fields
  (e.g. new workflow states surface as `state: string` + `stateLabel` presentation
  text so old clients render them without branching).
- **Contract tests both sides** (§9, §23) pin this policy in CI.

## 19. Expo project structure · 20. Environment strategy · 21. CI/build/release

**Stack (each dependency owned-purpose):** TypeScript · Expo SDK 57 (current stable
per docs.expo.dev, React Native 0.86 — pin at kickoff) · Expo Router (file-based
nav + deep links) · development builds only (no Expo Go — SecureStore/notification
config require native config) · EAS Build/Submit/Update · `expo-notifications` ·
`expo-secure-store` · `expo-web-browser` (OAuth) · `@supabase/supabase-js` (auth
only — **no data reads by policy**, §6) · TanStack Query (server state) · small
Zustand stores (local UI state only: active account selection, composer state) ·
Sentry via `sentry-expo` (crash/error reporting) · Jest + React Native Testing
Library + Maestro (or Detox) for device journeys. Nothing else without an owned
purpose.

```
ChainReactMobile/
  app/                    # Expo Router routes (auth, accounts, workflows, runs,
                          # notifications, settings)
  src/api/                # typed client over /api/mobile/v1 (consumes
                          # @chainreact/mobile-contracts; single fetch wrapper adds
                          # bearer + version headers, maps error envelope)
  src/auth/               # Supabase session, SecureStore adapter, MFA challenge
  src/push/               # registration, handlers, deep-link routing
  src/features/<domain>/  # screens + hooks per domain
  src/stores/             # Zustand (UI-only)
  eas.json  app.config.ts # per-environment config (below)
```

**Environments:**

| | Development | Preview (internal testing) | Production |
|---|---|---|---|
| Bundle/app id | `app.chainreact.mobile.dev` | `app.chainreact.mobile.preview` | `app.chainreact.mobile` |
| API base | dev tunnel/localhost → **currently prod backend (risk, §25)** | staging URL **(blocked until staging exists)** | `https://chainreact.app` |
| Supabase | the single project today (**blocker for external testers**) | staging project (to be created) | production project |
| Push credentials | dev APNs key / FCM dev app | separate app ids | production APNs key + FCM |
| EAS profile / channel | `development` / `development` | `preview` / `preview` | `production` / `production` |
| Sentry env | `development` | `preview` | `production` |
| Deep-link domains | dev scheme only | scheme + staging domain | `chainreact.app` + scheme |

**The temporary production-as-development posture** (§2.7) means: internal
development on Marcus's own devices against production data is an owner-accepted
risk consistent with the current web posture; **external testers (TestFlight
external, Play open testing) are blocked** until a staging Supabase project +
staging API deployment exist — already the roadmap's precondition for broad rollout.
Store-listing production release additionally requires the staging environment for
release QA. This is the single most important sequencing constraint in this plan.

**CI/release:** GitHub Actions in ChainReactMobile — typecheck, lint, unit/component
tests, contract-fixture tests on every PR; EAS Build on `main` merge (preview
profile) and on release tags (production). EAS-managed signing credentials (App
Store Connect API key, Play service account, APNs key, FCM). Distribution ramp: EAS
internal distribution (Android APK + iOS ad-hoc) → TestFlight internal + Play
internal testing → store submission via EAS Submit. Version management:
user-facing semver in `app.config.ts`, auto-incremented native build numbers via
EAS (`autoIncrement`); `runtimeVersion` policy pinned so EAS Update (JS-only
hotfixes) never crosses a native-module boundary. **Rollback/incident:** JS
regressions → republish previous EAS Update to the channel (minutes); native
regressions → halt phased release (iOS) / staged rollout (Play) + expedited review
with the previous build; backend regressions → the web repo's existing rollback
path; `forceUpdate` (§18) reserved for security-critical cases. In ChainReactV2's
CI, the four static gates + focused suites cover the new namespace as usual.

## 22. App-store & external-account prerequisites (Marcus)

1. **Apple Developer Program** membership (organization; D-U-N-S if enrolling as a
   company) — App Store Connect app record, TestFlight.
2. **Google Play Console** developer account — app record, internal testing track.
3. **Expo/EAS account** (org-owned) — EAS Build/Submit/Update; APNs key + FCM
   credentials stored in EAS.
4. **Firebase project** (FCM for Android push — delivery transport only, no Firebase
   SDK product usage; `[auth.third_party.firebase]` stays disabled).
5. **Sentry** (or chosen equivalent) org + project for crash reporting.
6. **GitHub repo `ChainReactMobile`** in the org.
7. **S0: staging Supabase project + staging deployment** — DECIDED 2026-07-31:
   now a hard prerequisite before M1 (§24, §25), not merely before external
   testers.
8. Supabase dashboard: register the `chainreact://auth/callback` redirect for Google
   OAuth on mobile.
9. ~~Product sign-off: failed-run push recipient model~~ — DECIDED 2026-07-31;
   policy recorded in §12.

## 23. Testing & device-certification matrix

Philosophy per `docs/rules/testing-strategy.md`: prove business behavior — good
path, bad path, failure handling, user-visible errors, state integrity.

**Backend (ChainReactV2):** unit tests per route (auth gate: valid bearer / missing /
garbage / expired → 401, no cookie fallback — copy the v1-trigger "no session mock"
guard); membership/cross-account isolation (404, no existence leak); lifecycle
delegation incl. 409 CONFIRM and 422/403 surfaces; non-terminal run detail; cursor
pagination edges; egress-parse failure = 500 test; no-leak suites (sensitive-marker
deep-serialize + hostile-string matrix + `scanForLeaks`) for every mobile DTO —
run-detail, integration-health, notifications, session; RLS/GRANT integration tests
for `mobile_push_devices` (+ deliveries) incl. deny-all client access; push channel:
registry preference gating, fan-out idempotency `(notificationId, deviceId)`,
receipt-driven token disable, **engine finalization unaffected by a push-provider
outage**; rate-limit 429 + `Retry-After`; register the mobile gate in
`tests/structure/api-route-authorization.test.ts` `AUTH_TOKENS`.

**Contract:** fixture request/response pairs for every §8 endpoint parsed against
`@chainreact/mobile-contracts` in web CI; the same fixtures decoded in mobile CI;
an old-client simulation (v1.0 fixture set) run against the current backend on every
backend change to the namespace.

**Mobile (ChainReactMobile):** unit (API client error mapping incl.
CONFIRMATION_REQUIRED and account-removed; auth/session refresh + expiry paths;
deep-link parser); component (run detail renders humanized failure; controls render
by capability flags; confirm sheet); push-routing tests (foreground / background /
cold-start × each target type); offline/slow-network (airplane-mode reads, timeout
UX, no phantom mutations).

**Device certification (physical, per release):** iPhone (current iOS + oldest
supported) + Pixel-class + one low-end Android; the mandatory vertical journey on
each: *sign in → select team account → see workflows → open run history → open a
failed run → perform pause/resume (and an activate with CONFIRM) → force a failed
run (dev-only fault workflow) → receive native push → tap from a terminated app →
land on the exact redacted run detail.* Plus: token rotation after reinstall,
logout kills push, removed-member lockout, force-update banner.

## 24. Ordered implementation batches (reversible)

Backend batches ship dark behind `ENABLE_MOBILE_API` (default OFF → 404); each is an
independent local batch with the four static gates + focused suites; nothing is
pushed/applied without Marcus's per-batch approval.

- **M0 — Contracts foundation (web repo). ✅ DELIVERED 2026-07-31**
  (MOBILE-COMPANION-M0-CONTRACTS-FOUNDATION-1). `packages/mobile-contracts/`
  (publish-ready, unpublished) + build/pack/pack-check scripts + contracts-purity
  and package-boundary structure locks + parity/denylist/fixture suites; the
  `vehicleSuggestions` impurity corrected via `contracts/linkHealth.ts`. No
  behavior change. *Reversal: delete folder.*
- **S0 — Dedicated ChainReact staging environment (LOCKED prerequisite,
  2026-07-31).** A separate staging Supabase project + staging application
  deployment, established and documented, before any M1 work. Rationale: mobile
  bearer authentication, rate limiting, and account-isolation testing must not
  be developed primarily against production data (§2.7's single-project posture).
  **Stop condition: M1 does not begin until S0 exists and is documented.** S0 is
  its own owner-approved batch — not part of M0, and deliberately not designed
  here.
- **M1 — Mobile auth gate + first reads (after S0 only).** `_shared.ts` bearer gate (+ flag + rate
  limiter) + `app-config`, `session`, workflows list/light-detail, runs
  list/per-workflow/detail (incl. non-terminal detail read model) + egress parse +
  no-leak suites. *Reversal: flag off (already dark).*
- **M2 — Controls + remaining reads.** Lifecycle + run-now delegations with full
  error surfaces; notifications REST + mark-read; integration-health; usage; member
  admin. *Completes the API for a pushless app.*
- **M3 — Push subsystem (needs migration approval + recipient sign-off).**
  `mobile_push_devices` (+ deliveries) migration; device routes; push channel +
  provider abstraction + Expo adapter; preference wiring
  (`getEnabledChannelsForUser` reads `notify_workflow_alerts`); decoupled delivery
  drain; receipts/cleanup cron. *Reversal: flag off; tables are additive.*
- **M4 — Mobile app foundation (new repo).** Expo scaffold, environments, auth +
  SecureStore + MFA challenge, account switcher, API client over contracts.
- **M5 — Monitoring surfaces.** Workflows, runs, run detail, notifications feed,
  usage, integration health.
- **M6 — Controls UX.** Lifecycle actions incl. CONFIRM sheet, disable-reason,
  reactivate→resume composite, run-now.
- **M7 — Push + deep links end-to-end.** Registration, handlers, cold-start routing,
  universal-link association files (small ChainReactV2 addition).
- **M8 — Hardening + certification.** Rate-limit tuning, min-version gate, Sentry,
  device-certification matrix, TestFlight/Play internal (internal testers only until
  staging exists).
- **Deferred (explicitly out):** true retry-from-trigger-event (backend feature:
  re-enqueue reusing the stored `trigger_event`, `triggeredBy:'retry'` — the enum
  value already exists), run cancel, realtime projections, OAuth reconnect on
  device, account rename (needs backend), HITL.

## 25. Risks, blockers, stop conditions

| # | Risk/blocker | Severity | Handling |
|---|---|---|---|
| 1 | **Single Supabase project (prod-as-dev).** Device-token migrations hit prod; external testers would touch real data. | **Blocking — S0 is now a hard prerequisite (locked 2026-07-31)** | **Stop condition (tightened):** M1 (bearer auth, rate limiting, account-isolation testing) does not begin until the S0 staging Supabase project + staging deployment exist and are documented. M0 was allowed against the current checkout because it changes no runtime behavior. External-tester distribution additionally waits for S0. |
| 2 | Failed-run recipient = creator only; push amplifies it on team accounts. | Resolved (policy) | Recipient policy LOCKED 2026-07-31 (§12); M3 implements it via a dedicated recipient-resolution service with focused tests. |
| 3 | No rate limiting on session-shaped auth today; a polling client is unbounded. | High | Limiter ships **in M1 with the gate**, not later. |
| 4 | Push delivery currently would sit on engine finalization path. | High | M3's queued drain is a hard requirement — a push outage must never block a run. |
| 5 | Non-terminal run detail 404s; run-now returns an unfetchable runId. | Medium | M1 read model must include `queued/running` or the signature journey dead-ends. |
| 6 | Account-scoping inconsistency (`/api/runs` personal-pinned). | Medium | Mobile namespace is explicit-account by construction; web fix is separate. |
| 7 | Apple/Google review timelines + org verification (D-U-N-S). | Medium | Start §22 accounts early; they parallelize with M0–M3. |
| 8 | Contract drift between repos. | Medium | Git-tag pinning + two-sided fixture tests (§9, §23). |
| 9 | Expo SDK cadence vs long-lived app. | Low | Pin SDK 57 at kickoff; upgrade only at deliberate maintenance windows; dev-build workflow insulates from Expo Go churn. |
| 10 | Scope creep toward builder/editing on mobile. | Low | §7 non-goals are the contract; any change is a plan revision, not a drive-by. |

**General stop conditions:** any mobile requirement that would demand duplicating
lifecycle/billing/authorization logic client-side → stop, build the backend seam
instead. Any contract need that would expose a §9 forbidden shape → stop, redesign
the DTO. Any migration → stop for per-batch owner approval.

## 26. Definition of done — first production mobile release

1. All §8 endpoints live behind `ENABLE_MOBILE_API=true` in production, every
   response egress-validated, no-leak suites green, rate-limited, and exercised by
   the two-sided contract fixtures.
2. `mobile_push_devices` (+ deliveries) applied with RLS/GRANT tests green;
   push delivery proven decoupled from run finalization by test.
3. Recipient model decided by Marcus and implemented; `notify_workflow_alerts`
   actually gates delivery.
4. The mandatory vertical journey (§23) passes on physical iOS and Android devices,
   including the terminated-app push tap → exact redacted run detail.
5. Old-client compatibility: v1.0 fixture suite passes against the deployed backend;
   `app-config` min-version gate verified.
6. Store presence: TestFlight + Play internal builds promoted through review;
   signing + push credentials owned in org EAS; rollback procedure (EAS Update
   republish + staged-rollout halt) documented and rehearsed once.
7. Staging environment exists and external-tester distribution happened there first
   (per risk #1's stop condition).
8. Sentry receiving symbolicated crashes from production builds with PII scrubbing
   verified.
9. Docs updated: this plan marked delivered per batch; runbook
   `docs/runbooks/mobile-release.md` created; `docs/PROJECT_MEMORY.md` curated via
   the memory-curator flow.
10. Nothing in the mobile app reads a Supabase table, holds a secret beyond its own
    session, or renders an unredacted run — re-verified by the structure/no-leak
    suites as a release gate.

---

*Prepared by MOBILE-COMPANION-FOUNDATION-AUDIT-1. Backend inventory verified against
the working tree at `856af294f` (2026-07-31); Expo SDK currency verified against
docs.expo.dev (SDK 57 / React Native 0.86, July 2026). This batch changed
documentation only.*
