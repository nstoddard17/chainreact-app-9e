# 5.ONBOARD-1 — First-Workflow Onboarding Checklist Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing committed, nothing pushed.**
**Date:** 2026-07-18
**Branch:** `v2-main`

**Source of truth (verified current state):**
[app/workflows/page.tsx](../../../app/workflows/page.tsx) (dashboard entry; AppShell + WorkflowsDashboard) ·
[features/workflows/WorkflowsEmptyState.tsx](../../../features/workflows/WorkflowsEmptyState.tsx) (no-workflows empty state) ·
[features/workflows/CreateWorkflowButton.tsx](../../../features/workflows/CreateWorkflowButton.tsx) (manual create → builder) ·
[app/api/workflows/route.ts](../../../app/api/workflows/route.ts) + [repositories/workflows.ts](../../../repositories/workflows.ts) (create path) ·
[services/workflows/templateManagement.ts](../../../services/workflows/templateManagement.ts) (`createWorkflowFromTemplate`, usage events) ·
[features/workflow-builder/panels/BuilderGuidanceRail.tsx](../../../features/workflow-builder/panels/BuilderGuidanceRail.tsx) (React Agent rail — edits current draft only) ·
[features/workflow-builder/validation/collectBuilderValidationIssues.ts](../../../features/workflow-builder/validation/collectBuilderValidationIssues.ts) + [core/workflows/requiredFields.ts](../../../core/workflows/requiredFields.ts) (builder setup-needed) ·
[services/workflows/executionReadiness.ts](../../../services/workflows/executionReadiness.ts) (`checkWorkflowReadiness` :28, `checkWritePathReadiness` :80 — server activation gate) ·
[services/diagnostics/integrationConnection.ts](../../../services/diagnostics/integrationConnection.ts) (`diagnoseWorkflowConnections` :382, `allRequiredConnected` :481) ·
[app/api/workflows/[id]/connection-readiness/route.ts](../../../app/api/workflows/[id]/connection-readiness/route.ts) (builder consumer of the above) ·
[services/workflows/lifecycleOrchestrator.ts](../../../services/workflows/lifecycleOrchestrator.ts) + [core/workflows/lifecycle.ts](../../../core/workflows/lifecycle.ts) + [contracts/workflow.ts](../../../contracts/workflow.ts) (`WorkflowStateSchema` :27) ·
[app/api/workflows/[id]/run-now/route.ts](../../../app/api/workflows/[id]/run-now/route.ts) + [repositories/workflowRuns.ts](../../../repositories/workflowRuns.ts) (test/manual runs; `is_test`, `triggered_by`) ·
[services/accounts/activeAccount.ts](../../../services/accounts/activeAccount.ts) (`resolveActiveAccount` :104) ·
[app/api/workflows/_shared.ts](../../../app/api/workflows/_shared.ts) (`requireUserWithAccount` :123, no-leak 404 helpers) ·
[services/accounts/accountAuthz.ts](../../../services/accounts/accountAuthz.ts) (`requireAccountRole`) ·
[app/apps/page.tsx](../../../app/apps/page.tsx) + [app/apps/_shared.ts](../../../app/apps/_shared.ts) (apps catalog, `canConnect`/`restrictedToAdmins`) ·
[app/api/integrations/oauth/[provider]/connect/route.ts](../../../app/api/integrations/oauth/[provider]/connect/route.ts) (APPS-PERM-1 role gate) ·
[repositories/integrations.ts](../../../repositories/integrations.ts) (`needs_reconnect_at` health model) ·
[services/integrations/reconnectNotification.ts](../../../services/integrations/reconnectNotification.ts) (one-shot reconnect notify) ·
[features/workflow-builder/state/configSlice.ts](../../../features/workflow-builder/state/configSlice.ts) (`openNode` :208, `revealNode` :230 with `fieldKey`) ·
[app/workflows/[id]/page.tsx](../../../app/workflows/[id]/page.tsx) (builder page — reads no searchParams today) ·
[repositories/aiCostEvents.ts](../../../repositories/aiCostEvents.ts) + [services/billing/aiCostEvents.ts](../../../services/billing/aiCostEvents.ts) (in-house fail-open event-ledger pattern) ·
[services/billing/billingFeatureFlags.ts](../../../services/billing/billingFeatureFlags.ts) (canonical default-OFF env-flag pattern) ·
[supabase/migrations/20260505000001_user_profiles.sql](../../../supabase/migrations/20260505000001_user_profiles.sql) + [supabase/migrations/20260531000009_user_profiles_active_account_id.sql](../../../supabase/migrations/20260531000009_user_profiles_active_account_id.sql) (per-user state precedent) ·
[scripts/check-migration-rls.mjs](../../../scripts/check-migration-rls.mjs) (same-file RLS + GRANT lint) ·
[docs/marketing/90-day-launch-marketing-plan.md](../../marketing/90-day-launch-marketing-plan.md) (activation checklist intent; A1/A2/A3/TTFR definitions, funnel §"Minimum viable launch funnel")

---

## 1. Context

The 90-day launch marketing plan names the in-app activation checklist as a top-4
activation lever ("In-app activation checklist (connect an app → use a template → test
run → activate)", [90-day plan line 734](../../marketing/90-day-launch-marketing-plan.md))
and defines the funnel it must move: **A1** first integration connected, **A2** first
successful workflow run, **A3** activated user, **TTFR** time-to-first-run (plan lines
553–556). Today ChainReact has **no onboarding surface at all** — a new user lands on
`/workflows`, sees the `no-workflows` empty state, and is on their own.

Marcus's brief for this slice: plan (not build) an interactive, state-driven checklist —
**Create → Connect → Configure → Test → Activate** — that is driven by real application
state, persists across sessions, is dismissible/reopenable, deep-links to the exact next
action, respects the account model and permissions, and is honest (no completion that the
database can't prove). A short optional video is secondary and never required.

This doc is grounded in a six-area code audit (auth/accounts, dashboard/UI, builder,
integrations, data layer/analytics/flags, tests) performed against the working tree at
`ce1e60d35` (clean).

---

## 2. Current codebase findings (verified)

Every claim below traces to a file read during the audit. Anything not confirmed is in
§2.11.

### 2.1 Signup and landing

- Signup: [app/auth/sign-up/page.tsx](../../../app/auth/sign-up/page.tsx) →
  `SignUpFlow` ([features/auth/SignUpFlow.tsx](../../../features/auth/SignUpFlow.tsx)),
  6-digit code verification (`verifySignupOtp` in
  [app/auth/actions.ts](../../../app/auth/actions.ts), AUTH-EMAIL-OTP-1, commit
  5cdd2c381). Post-auth redirect defaults to `/workflows`
  ([lib/safeReturnPath.ts](../../../lib/safeReturnPath.ts)).
- The personal account is created by the DB trigger `public.handle_new_user()`
  ([supabase/migrations/20260531000003_handle_new_user_account_billing.sql](../../../supabase/migrations/20260531000003_handle_new_user_account_billing.sql))
  at `signUp` time — rows: `user_profiles`, `accounts` (type `personal`),
  `account_memberships` (role `owner`), `account_billing`. Safety net:
  `ensurePersonalAccount` ([services/accounts/ensurePersonalAccount.ts](../../../services/accounts/ensurePersonalAccount.ts)).

### 2.2 Account model, active account, permissions

- Roles `owner | admin | member`; account types `personal | team | organization`
  ([contracts/accounts.ts](../../../contracts/accounts.ts)).
- Active account lives in **DB** (`user_profiles.active_account_id`), resolved every
  request by `resolveActiveAccount`
  ([services/accounts/activeAccount.ts:104](../../../services/accounts/activeAccount.ts))
  with membership re-verification; switching = `POST /api/account/active` + full reload
  ([components/app-shell/useAccountSwitcher.ts](../../../components/app-shell/useAccountSwitcher.ts)).
- Route gates: `requireUserWithAccount`
  ([app/api/workflows/_shared.ts:123](../../../app/api/workflows/_shared.ts)); workflow
  access is **role-agnostic membership** with no-leak 404 (`workflowNotFoundResponse`).
  Role gate for management routes: `requireAccountRole`
  ([services/accounts/accountAuthz.ts:22](../../../services/accounts/accountAuthz.ts)).
- **Permissions relevant to the checklist:** any member can create and activate
  workflows (`POST /api/workflows`, `POST /api/workflows/[id]/activate` — membership
  only, plus the private-credential gate `assertWorkflowRunEditAllowed`). Connecting
  **account-class** providers (slack, notion, stripe, shopify, hubspot, mailchimp,
  quickbooks, motive, adp per
  [core/integrations/credentialSharing.ts:128](../../../core/integrations/credentialSharing.ts))
  requires **owner/admin** (APPS-PERM-1 in
  [app/api/integrations/oauth/[provider]/connect/route.ts:157-177](../../../app/api/integrations/oauth/[provider]/connect/route.ts));
  personal-identity providers: any member.
- Team invites are copy-link based (no email infra); accept auto-activates the joined
  account ([services/accounts/invitations.ts](../../../services/accounts/invitations.ts)).
  **Adjacent gap found:** invite `acceptPath` points at `/invitations/accept`, but no
  page component exists there (API route only; no in-repo caller found).

### 2.3 Dashboard and existing UI surfaces

- `/workflows` renders `AppShell` + `WorkflowsDashboard`; zero-workflow state is
  `WorkflowsEmptyState` kind `no-workflows`
  ([features/workflows/WorkflowsEmptyState.tsx](../../../features/workflows/WorkflowsEmptyState.tsx),
  rendered at [WorkflowsDashboard.tsx:331](../../../features/workflows/WorkflowsDashboard.tsx)).
- **No onboarding / checklist / tour / first-run / video code exists anywhere**
  (repo-wide grep). Nearest surfaces: the empty state, the anonymous `/start` builder
  with post-signup draft restore, and the builder React Agent rail.
- Shared UI library is minimal ([components/ui/](../../../components/ui/): badge,
  button, command, input, label, popover, select, switch, textarea). **No** Dialog,
  Toast, Card, Progress, Stepper, or Accordion primitives — dialogs/toasts/cards are
  hand-rolled Tailwind (e.g.
  [features/workflows/folders/FolderFormDialog.tsx](../../../features/workflows/folders/FolderFormDialog.tsx)).
- Theming is scoped data-attribute surfaces (`[data-app-surface="dark"]` on AppShell,
  light `[data-builder-surface]`) driven by HSL tokens in
  [app/globals.css](../../../app/globals.css); no user theme toggle. Token classes
  (`bg-card`, `border-border`, `text-muted-foreground`) are the portable way to render
  correctly on both surfaces.
- Persisted-dismissal precedents: localStorage collapse pref
  ([features/workflow-builder/hooks/useLeftAgentRail.ts](../../../features/workflow-builder/hooks/useLeftAgentRail.ts));
  DB-persisted read-state exists only on `notifications.read_at`. **No DB table for
  dismissed UI state or per-user-per-account preferences exists.**
- The builder route `/workflows/[id]` does **not** mount AppShell (full-viewport
  surface); dashboard/shell pages are responsive, the builder has no mobile
  detection/gate at all (desktop-oriented but not enforced).
- Notification system: user-scoped `notifications` table + bell
  ([components/app-shell/NotificationBell.tsx](../../../components/app-shell/NotificationBell.tsx));
  type enum includes `integration_reconnect_needed` with one-shot semantics
  ([services/integrations/reconnectNotification.ts](../../../services/integrations/reconnectNotification.ts)).

### 2.4 Workflow creation paths (all land in the builder)

- **Manual:** `CreateWorkflowButton` → `POST /api/workflows` →
  `workflowsRepo.create` with empty graph (`{nodes: [], edges: []}`,
  [repositories/workflows.ts:149](../../../repositories/workflows.ts)) →
  `router.push("/workflows/{id}")`.
- **Template:** `/templates` → `POST /api/workflow-templates/[templateId]/use` →
  `createWorkflowFromTemplate`
  ([services/workflows/templateManagement.ts:262](../../../services/workflows/templateManagement.ts)) —
  new `draft` workflow with the template's sanitized definition; account-specific fields
  deliberately blank so standard "Needs setup" logic drives completion. Records
  `workflow_template_usage_events` (`used_to_create_workflow`).
- **React Agent:** builder-left-rail only (the dashboard "Build with me" card was
  removed — [app/workflows/page.tsx:98-101](../../../app/workflows/page.tsx)). The rail
  edits the **current draft** (explicit Apply, additive/local); the only create-new path
  is the official-template match card
  ([features/workflows/useTemplatePreviewFlow.ts:88](../../../features/workflows/useTemplatePreviewFlow.ts)).
- **Anonymous:** `/start` builds an in-memory draft; no workflow row until signup.

### 2.5 Setup-needed / configuration readiness

- Client: `collectBuilderValidationIssues`
  ([features/workflow-builder/validation/collectBuilderValidationIssues.ts:94](../../../features/workflow-builder/validation/collectBuilderValidationIssues.ts))
  — error codes `no_trigger`, `multiple_triggers`, `unconfigured_node`,
  `router_routes_invalid`, `missing_required_field`, `unreachable_node`, `stale_edge`,
  `self_loop_edge` (+ non-blocking `broken_variable_reference`). Required-field truth:
  [core/workflows/requiredFields.ts](../../../core/workflows/requiredFields.ts)
  (`missingRequiredFields` :137 — respects `hasDefault` and `visibleWhen`).
- Server (authoritative, gates activation): `checkWorkflowReadiness` /
  `checkWritePathReadiness`
  ([services/workflows/executionReadiness.ts:28,80](../../../services/workflows/executionReadiness.ts))
  — 422 `MISSING_REQUIRED_FIELDS` / `INVALID_WORKFLOW_GRAPH` /
  `INVALID_VARIABLE_REFERENCE` on activate.
- Diagnostics DTO already exists: `diagnoseWorkflowReadiness`
  ([services/diagnostics/workflowReadiness.ts](../../../services/diagnostics/workflowReadiness.ts))
  with `fieldGaps`, `graphIssues`, `providers`, `nodeLabels`.

### 2.6 Integration connection + health

- One page `/apps` (catalog merged with account connections);
  `resolveAppCatalog` computes `canConnect` / `canReconnect` / `needsReconnect` /
  `restrictedToAdmins` per row ([app/apps/_shared.ts](../../../app/apps/_shared.ts));
  non-privileged members see "Only an owner or admin can connect this app for the team."
  ([features/apps/AppCard.tsx](../../../features/apps/AppCard.tsx), testid
  `app-card-admin-required`).
- Health: no status column — active = `disconnected_at IS NULL`, unhealthy =
  `needs_reconnect_at` set (one-shot `markNeedsReconnect`,
  [repositories/integrations.ts](../../../repositories/integrations.ts)); derived
  call-time ladder `deriveConnectionDiagnosis`
  ([services/integrations/connectionDiagnosis.ts](../../../services/integrations/connectionDiagnosis.ts)).
- **Workflow↔provider readiness source of truth exists:**
  `diagnoseWorkflowConnections`
  ([services/diagnostics/integrationConnection.ts:382](../../../services/diagnostics/integrationConnection.ts))
  groups graph nodes by provider (skipping native), checks connection status per
  provider, returns `WorkflowConnectionsDTO` with `allRequiredConnected` (:481) and
  per-provider `ready`/`reconnectNeeded`/`canReconnect`. The builder already consumes it
  via `POST /api/workflows/[id]/connection-readiness`
  ([app/api/workflows/[id]/connection-readiness/route.ts](../../../app/api/workflows/[id]/connection-readiness/route.ts)).
- **No connect deep-linking exists:** no `?connect=<provider>` param, no
  `/apps/[provider]` route; every connect/reconnect CTA links to plain `/apps`
  (grep-verified across `app/`, `features/`, `lib/`, `services/`).

### 2.7 Test runs, run history

- Builder header run controls
  ([features/workflow-builder/layout/HeaderRunControls.tsx](../../../features/workflow-builder/layout/HeaderRunControls.tsx)):
  manual-trigger workflows get "Test Workflow" (draft definition, skips external/
  high-risk handlers, skips readiness preflight) and "Run Manually" (gated by blocking
  issues). **Automated-trigger workflows have no test path today** — disabled button,
  "Test runs for automated workflows are in development" (:111). `run-now` requires a
  `manual_trigger` node (422 otherwise).
- Runs are distinguishable: `workflow_runs.is_test` boolean + `triggered_by`
  (`manual|test|webhook|scheduled|retry|api_key|unknown`,
  [contracts/workflow.ts:219](../../../contracts/workflow.ts)). Display statuses
  `queued|running|succeeded|failed` (durable-queue model, DURABLE-QUEUE-1). Builder
  polls run detail ~1 s (60-poll ceiling) and auto-opens the results drawer.
- `authenticated` SELECT on `workflow_runs` is **revoked** (`20260701000000`) — all
  reads go through service-role repo readers after route-side membership gating.

### 2.8 Lifecycle / activation

- States: `draft | active | paused | disabled | eligible_to_resume | deleted`
  ([contracts/workflow.ts:27](../../../contracts/workflow.ts)); transitions in
  [core/workflows/lifecycle.ts:64](../../../core/workflows/lifecycle.ts).
- Activate route order: auth → membership 404 → private-credential gate → destructive-
  action confirm (409) → `checkWritePathReadiness` (422) → orchestrator
  (`tryRegisterTrigger` **before** persist; `TRIGGER_REGISTRATION_FAILED` → 502 with a
  safe message). Client gates Activate on `blockingIssueCount > 0`
  ([features/workflow-builder/panels/LifecycleActions.tsx:230-236](../../../features/workflow-builder/panels/LifecycleActions.tsx)).
- `workflows.active_revision_id` is set on activation (revision snapshot).

### 2.9 Navigation primitives

- [app/workflows/[id]/page.tsx](../../../app/workflows/[id]/page.tsx) reads **only**
  `params.id`; no `searchParams`, no `useSearchParams` anywhere under
  `features/workflow-builder/` (grep-verified). Deep-linking into a node/field is
  currently impossible from outside the builder.
- In-builder primitives are strong: `configSlice.openNode` (:208) and
  `configSlice.revealNode({nodeId, fieldKey?})` (:230) open the config rail, pan/zoom
  the canvas, and highlight a specific field — used today by the validation drawer and
  agent setup cards.

### 2.10 Data layer, analytics, flags, tests

- Migrations: flat `supabase/migrations/`, forward-only;
  [scripts/check-migration-rls.mjs](../../../scripts/check-migration-rls.mjs) enforces
  same-file RLS + corpus-wide GRANT coverage. Recent sensitive tables grant nothing to
  `authenticated` and keep a membership SELECT policy as defense-in-depth.
- **No third-party product analytics** (no PostHog/Segment/etc. anywhere;
  `package.json` clean). In-house pattern: typed, sanitized, **fail-open**, service-role
  event ledgers — `ai_cost_events`
  ([repositories/aiCostEvents.ts](../../../repositories/aiCostEvents.ts),
  [services/billing/aiCostEvents.ts](../../../services/billing/aiCostEvents.ts)),
  `task_usage_events`, `workflow_template_usage_events`, `react_agent_audit_events`.
- Flags are env vars only, canonical default-OFF pattern: exported flag-name const +
  call-time `process.env[FLAG] === "true"` predicate
  ([services/billing/billingFeatureFlags.ts](../../../services/billing/billingFeatureFlags.ts));
  server-evaluated and passed as props (never `NEXT_PUBLIC_`).
- Tests: jsdom Jest (unit/integration/structure/parity), 22 Playwright walkthroughs in
  `tests/e2e/` proving sign-in → connect (mock provider) → build → activate → event →
  succeeded run; e2e users are admin-created
  (`createTestUser` in
  [tests/e2e/helpers/supabaseAdmin.ts](../../../tests/e2e/helpers/supabaseAdmin.ts) —
  bypasses OTP); real-Supabase RLS suites behind `ALLOW_DB_INTEGRATION_TESTS=true`;
  prod smoke via `playwright.smoke.config.ts`.

### 2.11 Explicitly unverified

- Whether the hosted Supabase project's "Confirm email" toggle and OTP email templates
  are configured as the code expects (dashboard-side; flagged as pending in
  [docs/slices/phase-5/mvp-launch-readiness-audit.md:84](./mvp-launch-readiness-audit.md)).
- Whether `active_revision_id` remains set after pause/disable (asserted by design
  reading of the orchestrator; not traced through every transition). The plan below
  uses it only as *ever-activated evidence* and calls this out as an implementation
  check.
- Live-production parity with this working tree (repo-only audit; HEAD is ahead of
  `origin/v2-main`).

---

## 3. Product / model decision

**What this is:** a dismissible, state-derived "Launch your first workflow" checklist
that lives on the `/workflows` dashboard, tracks one *selected onboarding workflow*
through Create → Connect → Configure → Test → Activate, deep-links each step to the
exact next action, and ends in a quiet success state once the account genuinely has an
active workflow. It teaches by moving users through the real app.

**What this is deliberately NOT:**

- Not a blocking tutorial, modal tour, or forced template. The rest of the app is never
  gated.
- Not a parallel readiness engine. Every substantive completion signal is one of the
  existing sources of truth (§4.2); the feature adds **zero** new lifecycle,
  connection-health, or required-field logic.
- Not a required video. The optional video is a footer link; watching it never affects
  completion.
- Not a customer-success platform. No emails, no drip sequences, no per-step nudge
  scheduling in v1 (the 5-email sequence is a separate marketing-plan item).
- Not user-visible celebration theater. Completion gets a subtle success card, not
  confetti.

**Account-scoping decision (recommended):** onboarding progress is keyed on the
**(user, account) pair** — matching how ChainReact state actually works: assets are
account-owned, but *presentation* choices (dismissed, minimized, video watched) are
personal, and a user can hold several accounts at different stages. Substantive step
completion is derived from **account** state, so two members of the same account see the
same step truth but each control their own card visibility. A single global
`has_completed_onboarding` boolean fails cases 2, 3, 4, and 6 below and is rejected.

### The ten account cases

| # | Case | Behavior |
|---|---|---|
| 1 | Brand-new user, new personal account | Checklist shows on `/workflows` (flag ON, zero ever-activated workflows, not dismissed). Steps derive from the personal account. |
| 2 | User creates a new team account | Switching to the team account resolves a **separate** (user, team-account) row. Fresh checklist iff the team account has no ever-activated workflow. Personal progress untouched. |
| 3 | User invited into an empty team account | Same as 2 — checklist applies; they can create/activate (role-agnostic). Account-class connect steps may show the permission-limited state (§5.3) if they're a plain member. |
| 4 | User invited into a team with existing workflows | If any workflow was ever activated → derived-complete; the card **never appears** (no "create your first workflow" nagging). If the team has only drafts, the checklist may appear but step 1 is already complete — it reads as "finish setting up", which is honest and useful. |
| 5 | Member without integration permission | Step 2 renders its permission-limited state: "A workspace owner or admin needs to connect *Provider*" (derived from the same `restrictedToAdmins`/`canConnect` signals as `/apps`). No dead-end CTA; the step still auto-completes when an admin connects. |
| 6 | Switching accounts mid-onboarding | Active-account resolution already re-scopes everything per request; the checklist row is looked up by (user, resolved account). Each account keeps its own progress; nothing leaks across. |
| 7 | Multiple draft workflows before activating one | The checklist tracks the **selected workflow** (§4.3) with a visible "Working on: *name*" switcher. Activation of *any* account workflow latches completion — the goal is a live workflow, not loyalty to one draft. |
| 8 | Selected workflow deleted | `selected_workflow_id` is `ON DELETE SET NULL`; derivation auto-repoints to the most recently updated non-deleted workflow, or regresses to step 1 with the create CTA if none remain. No error, no orphaned pointer. |
| 9 | Dismiss and return | `dismissed_at` set → card hidden. Reopen via "Getting started" in the user menu (clears `dismissed_at`). Progress was derived all along, so the card reopens at the true current step. |
| 10 | Already-activated user before launch | Derived-complete on first evaluation (any ever-activated workflow) → `completed_at` latched silently, success/celebration suppressed, card never shown. No backfill job needed. |

**Selected-workflow decision (recommended):** persist `selected_workflow_id` in the
onboarding row. Default = the most recently updated non-deleted workflow in the account
at evaluation time; the user can switch via a small picker in the card; deletion
auto-repoints (case 8); any workflow reaching `active` completes onboarding regardless
of selection (case 7). The checklist does **not** silently follow whatever workflow is
open in the builder — auto-following makes progress appear to jump backward when a user
peeks at an older draft, which reads as dishonest.

**Existing-user decision (recommended):** show the checklist to any account (new or
pre-existing) with **zero ever-activated workflows** while the flag is ON — draft-only
existing users are exactly who it helps. Ever-activated evidence: any workflow with
`state ∈ {active, paused, disabled, eligible_to_resume}` or `active_revision_id IS NOT
NULL` (see §2.11 check). Accounts with such a workflow get silent latch-complete
(case 10).

**Optional-video decision:** a "See how it works — 1 min" text link in the card footer,
opening an in-app modal (house dialog pattern) with a captioned `<video>`; source URL
from a server env var pointing at a stable hosted asset (swap the asset at the same URL
to replace content without a deploy — note: changing the *env var itself* does require a
redeploy on Vercel). `video_watched_at` recorded at ≥90%/ended; never affects any step.
Producing the video is out of scope.

---

## 4. Recommended approach

### 4.1 State model: Hybrid (Approach C)

Persist **presentation state only**; derive **all substantive completion live** from the
authoritative sources; **latch** exactly two timestamps (`first_shown_at`,
`completed_at`) so the funnel and the success state are stable even if the account later
changes. Full comparison in §5.

New table `user_onboarding_states` (sketch in §6). Presentation fields: `dismissed_at`,
`minimized`, `video_watched_at`, `celebrated_at`, `selected_workflow_id`,
`first_shown_at`, `completed_at`.

### 4.2 Step derivation — one existing source of truth per step

> **Superseded (order, 2026-07-27):** the shipped checklist order is
> **connect → create → configure → test → activate**. Connect leads because it is
> account-level, needs no workflow, and is the prerequisite users hit mid-build.
> The completion rules below still describe each step (as amended by 5.ONBOARD-2/3);
> only the numbering in this table is stale. Order lives in
> [`contracts/onboarding.ts`](../../../contracts/onboarding.ts) and is emitted by
> [`services/onboarding/checklistDerivation.ts`](../../../services/onboarding/checklistDerivation.ts).

| Step | Completion rule (server-derived) | Source of truth (existing) |
|---|---|---|
| 1. Create your first workflow | ≥1 non-deleted workflow exists in the account | `workflows` via [repositories/workflows.ts](../../../repositories/workflows.ts) list-by-account |
| 2. Connect your apps | Selected workflow has ≥1 node **and** `allRequiredConnected === true` (vacuously true for native-only workflows — step renders as "No app connections needed") | `diagnoseWorkflowConnections` ([services/diagnostics/integrationConnection.ts:382](../../../services/diagnostics/integrationConnection.ts)) — includes `needs_reconnect_at` health |
| 3. Finish configuring your steps | `checkWritePathReadiness(draft_definition)` passes (graph integrity + required fields + variable refs — the **same** rule that gates activation server-side) | [services/workflows/executionReadiness.ts:80](../../../services/workflows/executionReadiness.ts) |
| 4. Test the workflow | ≥1 `workflow_runs` row for the selected workflow with `status = 'succeeded'` (test **or** real run — this is the marketing plan's A2 "aha" definition). Failed/queued/running rows never count. | `workflow_runs` via service-role reader ([repositories/workflowRuns.ts](../../../repositories/workflowRuns.ts)), route-gated |
| 5. Activate your workflow | Selected workflow `state === 'active'` exactly (`paused`/`disabled`/`eligible_to_resume`/`draft` never count) | `workflows.state` ([contracts/workflow.ts:27](../../../contracts/workflow.ts)) |
| **Overall complete** | Any account workflow observed `active` while this row is incomplete → latch `completed_at` | same |

**The automated-trigger wrinkle (honest handling, flagged for Marcus):** run-now
requires a `manual_trigger` node, and automated-trigger workflows have no test path
today (§2.7). For those workflows step 4 cannot precede step 5. Recommended behavior:
steps are **display-ordered but not hard-sequenced**; for an automated-trigger selected
workflow, step 4's copy becomes "Activate, and we'll confirm the first successful run,"
it stays pending at activation, and the success state uses exactly the required copy —
"Your first workflow is live. ChainReact will run it when its trigger occurs." — with a
quiet "waiting for its first run" line until a live `succeeded` run flips step 4. The
checklist never fakes a test that didn't happen.

**Regression policy:** steps 1–5 derive live and **can regress** before completion
(integration expires → step 2 un-completes with the reconnect state; config drift after
save-auto-deactivate → steps 3/5 regress). Once `completed_at` is latched, the card
shows the success state permanently (until dismissed) and never un-completes — the
funnel fact "this user got a workflow live" happened.

### 4.3 Placement + surfaces (recommended)

**Primary: a dashboard checklist card** at the top of `/workflows` (above
`WorkflowsStatCards`), rendered by `WorkflowsPage` from server-fetched initial state.
Minimized state = a slim one-line bar ("Launch your first workflow — 2 of 5 · Continue")
in the same slot. Reopen after dismissal via a **"Getting started"** item added to
[components/app-shell/UserMenu.tsx](../../../components/app-shell/UserMenu.tsx).

**Inside the builder: no new persistent chrome in v1.** The builder already has the
exact contextual guidance the checklist needs — the header validation pill/drawer,
`NodeConfigReadinessBanner` connect/reconnect CTAs, run controls, and lifecycle buttons.
The checklist's job is to *deliver the user to the right spot* (deep links, §4.4) and
let those surfaces take over; progress recomputes when they return to `/workflows`. A
minimized floating builder pill is listed as an optional later batch, not v1 — the
builder is visually dense already (validation pill + agent rail + drawers), and a fifth
competing surface risks repeating the `lifecycle-blocked-hint` mistake that was just
removed.

Why not the alternatives: a persistent side panel steals width from a list page that
doesn't need it; a builder-side checklist duplicates the validation drawer's job; a
global launcher-only design hides progress exactly when motivation matters most (first
session). Evaluation table in §5.

### 4.4 Contextual guidance + the two missing navigation primitives

| Step CTA | Destination | Exists today? |
|---|---|---|
| Create workflow | Chooser popover on the card: "Describe it to React" → create empty workflow + open builder (agent rail is in-builder), "Start from a template" → `/templates`, "Build from scratch" → existing `CreateWorkflowButton` flow | Yes (all three paths exist; the chooser is new UI only) |
| Connect *Provider* | `/apps?highlight=<provider>` → scroll + highlight that provider's card (no auto-started OAuth — connect stays an explicit click on the real button, preserving APPS-PERM-1 server gating) | **No — new primitive N1** |
| Finish configuring | `/workflows/[id]?focus=setup` → after hydration, builder computes the first incomplete node (same `missingRequiredFields` rule) and calls `configSlice.revealNode({nodeId, fieldKey})` — field-level highlight already exists (:230) | **No — new primitive N2** (searchParams read + one-shot post-hydrate focus effect) |
| Test the workflow | `/workflows/[id]?focus=test` → builder briefly highlights the header run controls (existing testids); results surface via the existing auto-opened results drawer | Piggybacks on N2 |
| Activate | `/workflows/[id]?focus=activate` → highlights lifecycle actions; if blocked, the existing validation pill/drawer explains why | Piggybacks on N2 |

N1 and N2 are small, generally useful, and are the **only** navigation code this feature
needs. Everything else reuses `openNode`/`revealNode`, the validation drawer, the
readiness banner, and the results drawer.

### 4.5 UX states (all required states mapped)

- **New/untouched:** full card, step 1 current, chooser CTA. `first_shown_at` latched on
  first render.
- **In progress:** completed steps get checkmarks; the first incomplete step is
  highlighted (`aria-current="step"`) with its CTA; later steps are visible but muted
  (visible-not-locked — users may activate before testing; honesty over ceremony).
- **Blocked — permissions:** step 2 shows "Ask a workspace owner or admin to connect
  *Provider*" (from `restrictedToAdmins`); CTA hidden, step still auto-completes when
  an admin connects.
- **Blocked — missing integration:** step 2 lists each required provider with its
  status pill (mirrors `WorkflowProviderConnectionEntry`).
- **Blocked — reconnect required:** step 2 regresses with "Reconnect *Provider*" → N1
  link (reconnect itself stays the authorized in-page button on `/apps`).
- **Test running:** client-side only — the builder's run polling owns this; on the
  dashboard the step shows its last derived truth (no fake spinner).
- **Test failed:** step 4 stays incomplete; sub-line "Last test failed — open the
  results to see why" → builder (results drawer). Never marked complete.
- **Test succeeded:** step 4 complete with timestamp.
- **Activation failed:** step 5 incomplete; the builder already surfaces the safe
  `TRIGGER_REGISTRATION_FAILED` message inline; the card shows "Activation didn't
  finish — usually a connection issue" linking back.
- **Completed:** success card — "**Your first workflow is live.** ChainReact will run it
  when its trigger occurs." + subtle one-time animation (CSS, respects
  `prefers-reduced-motion`), `celebrated_at` latched; card offers "Done" (dismiss).
- **Dismissed / minimized / reopened:** §4.3; presentation-only writes.
- **Selected workflow deleted / no eligible workflow:** case 8 auto-repoint or step-1
  regression.
- **Existing active workflow detected:** case 10 silent latch; card suppressed.
- **Loading:** server-rendered initial state (no skeleton flash on the dashboard);
  refresh-on-focus revalidation is client-side and silent. **Error:** derivation
  failure renders the card in its last-known/omitted state — the checklist must never
  break `/workflows` (fail-open, same philosophy as the event recorders).

Accessibility: the card is a `role="region"` with `aria-label="Getting started"`; steps
are an `<ol>` with `aria-current="step"`; completion changes announced via the existing
`role="status"` idiom; all CTAs are real links/buttons (keyboard reachable); light/dark
correctness via token classes on both `data-app-surface` and builder surfaces.

---

## 5. Alternatives considered

### 5.1 State model

| Dimension | A — persist per-step completion | B — derive everything | C — hybrid (chosen) |
|---|---|---|---|
| Honesty (no stale/false completion) | **Fails** — stored "connected ✓" survives token revocation, config drift, workflow deletion; exactly the dishonesty Marcus banned | Perfect for steps; but completion itself can *un-complete* (activated → paused shows the checklist again — confusing) | Steps always true; `completed_at` latch keeps the finished story stable |
| Query cost | Cheapest reads | Highest — every dashboard load runs connection + readiness derivation with no place to keep "shown/dismissed" | Bounded: one row read + derivation only while incomplete and not dismissed; nothing runs once completed/dismissed |
| Multi-workflow ambiguity | Needs a workflow pointer anyway | Ambiguous — which draft's readiness counts? | Resolved via persisted `selected_workflow_id` |
| Dismissal/minimize persistence | Fine | **Nowhere to put it** (would end up in localStorage — lost across devices) | First-class columns |
| Forgery resistance | Client could nudge step-completion writes unless every write re-derives (at which point it *is* C) | Inherent | Inherent — clients can only write presentation fields |
| Migration surface | Widest (per-step columns) | None | One narrow table |

**Chosen: C.** A is rejected as structurally dishonest; B is rejected because
presentation state genuinely needs persistence and repeated whole-account derivation on
every load is avoidable cost.

### 5.2 Placement

| Option | Verdict |
|---|---|
| Dashboard card (chosen) | Meets the user where every session starts; zero new chrome elsewhere; server-renderable |
| Persistent side panel | Steals layout on every shell page for a feature most users finish once; rejected |
| Builder-side checklist | Duplicates the validation drawer/readiness banner; the builder is already dense; rejected for v1 |
| Global launcher + contextual-only guidance | Good as the *reopen* mechanism (adopted for that), too hidden as the primary surface |
| Dashboard card + floating builder mini-control | Deferred optional batch — value unproven, density risk real |

### 5.3 Selected-workflow strategies

First-created (goes stale when users abandon a first attempt), most-recently-edited-only
(jumps around without consent), explicit-user-choice-only (adds a decision before value),
any-workflow-any-milestone (steps 2–4 could each reference *different* workflows —
incoherent guidance). **Chosen:** persisted pointer, sensible default, user-switchable,
auto-repoint on delete, any-activation completes (§3).

---

## 6. Security / data model

### 6.1 Schema sketch (one migration)

```sql
-- user_onboarding_states: presentation state for the first-workflow checklist.
-- Substantive completion is ALWAYS derived server-side; these columns can never
-- assert that a workflow is connected/configured/tested/active.
create table public.user_onboarding_states (
  user_id              uuid not null references auth.users(id) on delete cascade,
  account_id           uuid not null references public.accounts(id) on delete cascade,
  selected_workflow_id uuid references public.workflows(id) on delete set null,
  first_shown_at       timestamptz,
  dismissed_at         timestamptz,
  minimized            boolean not null default false,
  video_watched_at     timestamptz,
  completed_at         timestamptz,   -- latched by server derivation only
  celebrated_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (user_id, account_id)
);

-- onboarding_events: fail-open analytics ledger (§8), same posture as ai_cost_events.
create table public.onboarding_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  account_id  uuid references public.accounts(id) on delete cascade,
  event_type  text not null,          -- CHECK-constrained to the §8 taxonomy
  step_key    text,                   -- create|connect|configure|test|activate
  workflow_id uuid,                   -- id only, never config/content
  provider    text,                   -- provider KEY only (e.g. 'slack')
  metadata    jsonb not null default '{}'::jsonb,  -- sanitized, allow-listed keys
  created_at  timestamptz not null default now()
);
```

### 6.2 RLS / GRANT plan (matches `check-migration-rls.mjs` + current house posture)

- `user_onboarding_states`: RLS enabled; SELECT policy `user_id = auth.uid()` (a user
  reads only their own rows); **no** authenticated INSERT/UPDATE/DELETE policy or
  grant — all writes via service-role from the onboarding routes (mirrors the
  integrations/workflow_runs revoke-series posture). `GRANT SELECT` to `authenticated`,
  full grant to `service_role` (satisfies the corpus GRANT rule). Route-side membership
  is enforced anyway via `requireUserWithAccount` before any read/write.
- `onboarding_events`: service-role only (no authenticated grants; defense-in-depth
  deny-all or membership SELECT policy — recommend no client read path at all in v1).
- Same-file RLS + GRANTs, header rationale comment, forward-only — per lint.

### 6.3 No-leak / anti-forgery analysis

- **Completion cannot be forged:** the client API can only set presentation fields
  (dismiss/minimize/reopen/select/video). `completed_at` and every step boolean are
  computed server-side from account-gated reads. `POST` with `selected_workflow_id`
  must pass the existing membership check and collapses to the standard no-leak 404
  (`workflowNotFoundResponse`) for foreign workflows — no existence oracle.
- **No cross-account leakage:** every derivation call starts from
  `requireUserWithAccount` (resolved active account) and touches only that account's
  workflows/integrations; the DTO carries workflow id/name/state, provider keys,
  display names, and booleans — never tokens, scopes, provider account ids, node
  config, or other members' identities (same discipline as
  `WorkflowConnectionsDTO`).
- **Permission signals, not permission bypass:** the card's "admin required" state
  reuses the same role computation as `/apps` server-side; the server routes remain the
  authority (UI gating is advisory, exactly as `resolveAppCatalog` documents).
- **Events are content-free:** ids, keys, timestamps only (§8); recorder is fail-open
  and never blocks the user path; no PII beyond the user/account ids that every other
  ledger already carries.

---

## 7. API / service / UI expectations (described, not built)

**Module placement** — audited against
[docs/rules/project-structure-and-module-boundaries.md](../../rules/project-structure-and-module-boundaries.md)
conventions; `features/onboarding/` fits the existing `features/<area>/` pattern:

```
features/onboarding/            OnboardingChecklistCard.tsx, OnboardingSuccessCard.tsx,
                                OnboardingVideoModal.tsx, steps copy/types,
                                hooks/useOnboardingChecklist.ts
lib/api/onboarding.ts           typed client (house WorkflowApiError-style error class)
app/api/onboarding/route.ts     GET (derive) — requireUserWithAccount
app/api/onboarding/presentation/route.ts  POST (dismiss|reopen|minimize|expand|
                                select_workflow|video_watched|celebrated)
services/onboarding/checklistDerivation.ts  pure step-composition (unit-testable)
services/onboarding/checklistState.ts       orchestration: reads workflows list,
                                calls diagnoseWorkflowConnections +
                                checkWritePathReadiness + succeeded-run lookup,
                                latches first_shown_at/completed_at (read-time
                                self-heal, precedent: resolveActiveAccount)
services/onboarding/onboardingFlags.ts      ENABLE_ONBOARDING_CHECKLIST (default OFF)
services/onboarding/onboardingEvents.ts     fail-open recorder (ai_cost_events pattern)
repositories/userOnboardingStates.ts        service-role CRUD
repositories/onboardingEvents.ts            service-role insert
```

Client component → `useOnboardingChecklist` → `lib/api/onboarding.ts` → thin route →
service → repository — no DB access or business rules in React components; no
duplicated lifecycle/readiness/connection logic anywhere in the feature.

**GET response DTO (sketch):** `{ enabled, completed, completedAt, presentation:
{dismissed, minimized, videoWatched}, selectedWorkflow: {id, name, state} | null,
steps: [{key, status: 'complete'|'current'|'pending'|'blocked', blockedReason?:
'admin_required'|'reconnect_required'|..., detail?, cta: {label, href}}] }`.

**Dashboard wiring:** `app/workflows/page.tsx` adds one parallel server fetch (flag ON
and account not derived-complete) and passes `initialOnboarding` to the dashboard;
render above the stat cards. **UserMenu:** one "Getting started" item (visible while
flag ON) that clears `dismissed_at` and scrolls to the card.

**Navigation primitives:** N1 — `/apps` reads `highlight` searchParam, scroll+highlight
provider card. N2 — `/workflows/[id]` reads `focus` searchParam
(`setup|test|activate`), threads an `initialFocus` prop to `WorkflowBuilder`, one-shot
post-hydration effect calls `revealNode` on the first incomplete node (shared
first-incomplete helper extracted beside
[features/workflow-builder/utils/appliedConfigHints.ts](../../../features/workflow-builder/utils/appliedConfigHints.ts)'s
`firstIncompleteAppliedNodeId` precedent) or highlights the run/lifecycle controls.
Navigation-only: N1/N2 never start OAuth, never mutate config, never save/run/activate.

---

## 8. Analytics plan

**Recommendation: in-house `onboarding_events` ledger now; PostHog mirroring later.**
The marketing plan targets PostHog, but no analytics vendor exists in the codebase today
and adding one is its own decision (privacy posture, script loading, consent). The
funnel questions are answerable from server truth + a small ledger; when the marketing
Week-0 PostHog batch lands, mirror these same event names client-side.

**Event taxonomy** (CHECK-constrained; recorder fail-open):

| Event | Fired when | Properties (all safe) |
|---|---|---|
| `onboarding_shown` | first card render per (user, account) | — |
| `onboarding_step_completed` | derivation observes a step newly complete | `step_key`, `workflow_id`, `provider?` |
| `onboarding_cta_clicked` | any step CTA | `step_key`, `workflow_id?`, `creation_path?` (`agent`\|`template`\|`manual`) |
| `onboarding_dismissed` / `onboarding_reopened` / `onboarding_minimized` | presentation actions | — |
| `onboarding_workflow_switched` | selected-workflow change | `workflow_id` |
| `onboarding_video_opened` / `onboarding_video_watched` | video modal / ≥90% | — |
| `onboarding_completed` | `completed_at` latched | `workflow_id`, `days_since_signup` (integer) |

Never logged: node config, provider payloads, tokens, email/message content, workflow
definitions, template contents.

**Funnel + questions answered:** signup (`auth.users.created_at`) → `onboarding_shown`
→ step-completed events (create/connect/configure/test/activate) → `onboarding_completed`,
joined with existing server truth: `workflows.created_at`, `integrations.created_at`
(A1), first succeeded `workflow_runs` row (A2), `completed_at` (A3 precursor; A3 proper
= marketing definition over `workflow_runs`). Median signup→activation =
`completed_at − auth.users.created_at`. Creation-path comparison: `creation_path` on
the create CTA + `workflow_template_usage_events` for template attribution (agent
create-new flows through template-use, so agent-vs-template attribution is approximate —
noted honestly). Dismiss/reopen rates, video-watcher activation lift, and invited-member
vs owner behavior (join `account_memberships.role`, personal vs team account type) all
come straight off the ledger. Reporting surface in v1: SQL/owner queries only — no
dashboard build.

---

## 9. Migration, backfill, rollout

- **Migration needed: yes, one** — `user_onboarding_states` + `onboarding_events`
  (+ enum/CHECKs), same-file RLS + GRANTs. No changes to existing tables. Justified
  under "do not add DB migrations unless truly needed": presentation state has no home
  today (§2.3) and localStorage fails the cross-session/cross-device requirement.
- **Backfill: none.** Rows are created lazily on first show; already-activated accounts
  latch silently on first evaluation (case 10). No data migration, no job.
- **Feature flag:** `ENABLE_ONBOARDING_CHECKLIST`, default OFF, exact
  `=== "true"` house pattern, server-evaluated in `app/workflows/page.tsx` (and the two
  routes 404/no-op when OFF). Rollout: ship OFF → enable in Marcus's env → enable in
  prod when verified. This is justified (user-visible, new table, launch-adjacent).
- **Rollback:** flag OFF fully hides the feature and stops all writes; tables are
  additive and inert; forward-only migration policy respected (no down-migration
  required, matching house practice).
- **Existing-user matrix:** active workflow(s) → never see it (case 10); drafts-only →
  see it mid-progress; no workflows → see it fresh; multi-account users → per-account
  behavior (case 6); all-paused/disabled accounts → treated as ever-activated →
  suppressed (they've already reached the goal once; resurfacing "launch your first
  workflow" would be wrong).

---

## 10. Tests required (implementation must prove)

**Unit** (`tests/unit/services/onboarding/`, pure derivation):
step derivation across all §4.2 rules — no workflows / empty graph / native-only
(vacuous connect) / provider missing / provider `needs_reconnect_at` set (regression) /
required-field gap / variable-ref gap / failed-vs-succeeded-vs-running test runs /
every non-`active` lifecycle state rejected for step 5 / automated-trigger step-4
deferral / selected-workflow default + auto-repoint on delete + switch / ever-activated
latch / completed-latch immutability / permission-blocked derivation for member vs
owner/admin on account-class providers / fail-open on derivation sub-errors.

**Route** (`tests/unit/app/api/onboarding/`, node env, house mock pattern):
gate ordering (`requireUserWithAccount` first) · flag OFF → 404/no-op · presentation
POST can never write `completed_at`/step state (forgery attempt → 400) ·
`select_workflow` foreign id → no-leak 404 · frozen account → 403
`ACCOUNT_PENDING_DELETION` · DTO no-leak scan (no token/scope/config/member-identity
fields, mirroring existing route no-leak tests).

**DB/RLS** (`tests/integration/security/`, `ALLOW_DB_INTEGRATION_TESTS`):
`user_onboarding_states` — user reads only own rows; cross-user/cross-account
SELECT/UPDATE yields zero rows, no error leak; authenticated INSERT/UPDATE denied
(42501); service-role bypasses. `onboarding_events` — no authenticated access.

**Component** (`tests/unit/features/onboarding/` + dashboard integration):
correct current step rendered from DTO · CTAs carry expected hrefs (N1/N2 params) ·
failed-test stays incomplete · success card renders exact required copy · permission-
blocked copy for member role · dismiss → hidden; reopen via user-menu path → visible at
true step · minimized bar · dark-surface token rendering (existing convention — assert
token classes, no hardcoded colors) · reduced-motion-safe celebration.

**Builder/apps integration** (`tests/integration/features/`):
`?focus=setup` reveals first incomplete node + field (revealNode called once,
navigation-only — no config mutation, no save) · `?focus=test|activate` highlights
controls · `/apps?highlight=slack` scrolls/highlights without starting OAuth.

**E2E** (extend the slice-1 Slack mock harness; `--workers=1`):
good path — admin-created user → sign in → dashboard shows checklist → create workflow
→ card links to `/apps?highlight=slack` → real OAuth against mock Slack → return,
step 2 complete → `?focus=setup` → fill required fields → test run succeeds (step 4) →
activate (step 5) → success card → sign out/in → still completed. Bad paths — failed
test keeps step 4 open; mock-forced trigger-registration failure keeps step 5 open with
safe message; plain member in a team account sees admin-required state; account switch
shows the other account's independent state.

---

## 11. Implementation slice breakdown

| Slice | Contents (likely files) | Depends on | Acceptance |
|---|---|---|---|
| **CS-ONBOARD-1 — data + derivation + API** | Migration (`user_onboarding_states`, `onboarding_events`); `repositories/userOnboardingStates.ts`, `repositories/onboardingEvents.ts`; `services/onboarding/*` (flags, derivation, state, events); `app/api/onboarding/*` routes; `lib/api/onboarding.ts`; unit + route + RLS tests | — | All §10 unit/route/RLS tests green; flag OFF = inert; `npx tsc --noEmit`, lints, `npm test` green |
| **CS-ONBOARD-2 — dashboard card UI** | `features/onboarding/*`; `app/workflows/page.tsx` wiring; `UserMenu` "Getting started"; component tests | CS-1 | Card renders every §4.5 state from DTO fixtures; dismiss/minimize/reopen persist; no builder changes yet (CTAs may temporarily point at plain routes) |
| **CS-ONBOARD-3 — navigation primitives + deep links** | `/apps` `highlight` param (AppsDashboard scroll/highlight); `/workflows/[id]` `focus` param + `WorkflowBuilder` one-shot focus effect + shared first-incomplete helper; checklist CTAs switched to deep links; builder/apps integration tests | CS-2 | §10 builder/apps integration tests green; navigation-only invariants asserted |
| **CS-ONBOARD-4 — events + E2E + video surface** | Event recording at the §8 call sites; optional-video modal (env-var URL, captions); E2E journey + bad paths; owner funnel queries documented in the slice closeout | CS-3 | E2E good+bad paths green sequentially; events content-free by test; video never gates completion (asserted) |

Four meaningful batches — not over-sliced; each independently reviewable and gate-runnable.
Optional later (explicitly deferred): floating builder mini-pill; PostHog mirroring;
automated-trigger test runs (its own product feature); `/invitations/accept` page (a
pre-existing gap worth its own small slice — not part of onboarding).

---

## 12. Risks / open questions (Marcus decisions in **bold**)

1. **Approve the account-scoping model** (per user+account; §3) and the ten-case
   behavior table — especially case 4 (drafts-only team shows a mid-progress card to
   invitees).
2. **Approve the automated-trigger step-4 handling** (§4.2) — the alternative
   (hide step 4 entirely for automated workflows) is simpler but loses the A2 signal.
3. **Approve "any activation completes onboarding"** vs strictly the selected workflow.
4. **Analytics home:** in-house ledger now + PostHog later (recommended) vs waiting for
   PostHog and shipping no events — affects whether funnel data exists at launch.
5. **Ever-activated evidence** must be verified in implementation (does
   `active_revision_id` persist through pause/disable? §2.11) before the case-10 rule
   ships — an implementation-time check with a fallback (`state`-set test alone).
6. Architecture risk: derivation calls `diagnoseWorkflowConnections` +
   `checkWritePathReadiness` per dashboard load while incomplete — bounded (one
   workflow, short-circuits when dismissed/complete), but keep an eye on `/workflows`
   latency; a short in-request memo or stale-while-revalidate is an easy escape hatch.
7. UX risk: the card competes with the empty state on a brand-new account — CS-2 should
   render the checklist *instead of* duplicating `WorkflowsEmptyState`'s copy when both
   would show.
8. Honesty risk (designed against, worth restating): any future "optimization" that
   caches step completion in the table reintroduces Approach A's staleness — the table
   comment forbids it; reviewers should enforce it.
9. Security/privacy: DTO and events are id/key-only by contract; the no-leak tests in
   §10 are the enforcement. Presentation routes are membership-gated and cannot write
   derived fields.
10. The signup→confirm cross-device email-template ops task
    ([mvp-launch-readiness-audit.md:84](./mvp-launch-readiness-audit.md)) sits upstream
    of every onboarding funnel number — unresolved, pre-existing, not part of this
    feature.

---

## 13. Acceptance criteria

**This planning slice:** this doc exists, grounded in cited files; no source, test,
migration, or UI files changed; nothing committed (per Marcus's explicit instruction for
this batch, overriding the usual docs-commit step); nothing pushed.

**The implementation (later):** every §4.2 completion rule enforced server-side from the
named sources of truth; zero duplicated readiness/lifecycle/connection logic; all §10
tests green plus the standard gates (`npx tsc --noEmit`, `npm run lint`,
`npm run lint:structure`, `npm run lint:migrations`, `npm test`, targeted Playwright
sequentially); flag default OFF; no push without Marcus's explicit approval.

## 14. Hard boundaries (what this slice did NOT change)

No code, schema, tests, routes, services, UI, flags, or docs other than this file. No
commit. No push. No deployment. Production untouched.

## 15. Recommended next step

Marcus reviews §12 decisions 1–4; on approval, pick up **CS-ONBOARD-1** (data +
derivation + API, flag OFF) as the next implementation slice.

---

## 16. Owner report (plain language)

**What I inspected.** Six parallel audits over the real codebase: signup/account
creation and the membership/permission model; the dashboard, empty states, and every
reusable UI surface; all three workflow-creation paths and the builder's readiness,
test-run, and activation machinery; integration connect/health; the data layer,
analytics, and feature-flag patterns; and the existing test infrastructure. Key files
are cited throughout §2. I also re-read the 90-day marketing plan so the checklist and
its metrics line up with the funnel you already defined.

**Recommended design in one paragraph.** A dismissible "Launch your first workflow"
card at the top of the workflows dashboard, behind a default-OFF env flag. It tracks
one selected workflow through five steps whose completion is *computed* from the same
systems that already gate the product — the workflows table, the workflow-connections
diagnosis, the server activation-readiness check, real run records, and the lifecycle
state — so it can never claim something the database can't prove. Only presentation
state (dismissed, minimized, selected workflow, video watched, shown/completed
timestamps) is stored, in one small new table keyed by user + account. Each step
deep-links to the exact next action; inside the builder, the existing validation pill,
connection banners, and run controls take over rather than adding new chrome. Completion
shows a quiet "Your first workflow is live" card. A 60–90-second optional video sits in
the card footer and never gates anything.

**Decisions you need to approve** (§12): the per-user-per-account scoping and the
ten-case behavior table; how step 4 behaves for automated-trigger workflows (no test
path exists for them today); whether activating *any* workflow completes onboarding
(recommended yes); and in-house analytics events now vs waiting for PostHog.

**Migration likely?** Yes — one additive migration (presentation-state table + a small
events ledger). No changes to existing tables, no backfill job.

**Ships incrementally?** Yes — four batches: data/API (inert, flag OFF) → dashboard
card → deep-link navigation primitives → events + E2E + video surface. Each passes the
full gates independently.

**Largest implementation risk.** The two missing navigation primitives (provider
highlighting on `/apps`, and `?focus=` deep-linking into the builder's reveal-node
machinery) touch the builder's hydration path — the focus effect must be strictly
one-shot and navigation-only or it could fight the canvas/config state. Second: keeping
derivation honest *and* cheap on every dashboard load.

**Confirmation.** No code was changed, no migration created, nothing committed, nothing
pushed, production untouched. The only file written is this planning document.
