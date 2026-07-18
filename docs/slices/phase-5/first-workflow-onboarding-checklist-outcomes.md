# 5.ONBOARD-1 — First-Workflow Onboarding Checklist — Outcomes

**Type:** Implementation slice (4 local batches + docs). **Local commits only —
nothing pushed, nothing deployed, no migration applied to any hosted database.**
**Date:** 2026-07-18 · **Branch:** `v2-main` · **Plan:**
[first-workflow-onboarding-checklist-plan.md](./first-workflow-onboarding-checklist-plan.md)
**Flag:** `ENABLE_ONBOARDING_CHECKLIST` — **default OFF** (everything below is
inert until it is set to `"true"`).

**Commits (local):**

| Batch | Commit | Contents |
|---|---|---|
| 1 | `6fb05b629` | data + derivation + API + completion latch + tests |
| 2 | `90903ea3d` | dashboard checklist design + user-menu entry + component tests (also carries the approved plan doc) |
| 3 | `75a685edd` | `/apps?highlight` + builder `?focus=` deep links + tests |
| 4 | `e4427c76e` | `onboarding_events` + video surface + e2e spec + call-site wiring |
| docs | (this commit) | outcomes doc |

---

## 1. Design import (Claude Design project)

Imported via the design MCP from project `3c6250cb-eea4-43e4-b28e-76fd497ba49b`:

- **`Onboarding.html`** — a thin shell: all widget CSS (`.ob-*` — card, head,
  3px progress bar, step rows/marks, pill, celebrate pulse, final state,
  reopen button) plus a **mock dashboard backdrop** (side nav, greeting, stat
  tiles, recent-workflows rows) that exists only to stage the widget.
- **`src/onboarding-app.jsx`** — the real widget (`OnboardingWidget`): expanded
  card / minimized pill / completed / dismissed states, localStorage demo
  persistence, click-to-complete steps.
- **`src/icons.jsx`** — the stroke icon set (Bolt, Database, Webhook, Play,
  Share, Check, Arrow, chevrons, Sparkle, …).
- `src/home-logo.jsx` (AnimatedLogo) was **not** imported — the app's real
  `MarketingBrandLogo` fills that role.

**Screens/states found:** expanded card (header + progress + accordion step
list with done/active/pending rows), minimized pill with progress ring,
completed "final" state with celebrate pulse, dismissed → floating "Setup
guide" reopen button. **No video surface exists in the design.**

**Reusable patterns ported:** 384px card (`max-w-sm`) with 18px radius +
vertical panel gradient + inset 1px ring; 26px square step marks (icon →
filled check with pop); active-row raised panel + description + primary CTA
with trailing arrow; struck-through done label + uppercase pill tag; 3px
gradient progress bar; ghost footer buttons; ring-progress pill.

**Design states that could NOT map to real behavior:** the "Mark done" skip
button (forbidden fake completion — removed); demo steps "Add a trigger" /
"Invite a teammate" (replaced by the locked product steps); the "about 4 min
left" estimate (not honestly derivable — dropped); localStorage persistence
(replaced by the DB-backed presentation row); the auto-"connect done" demo
seed (replaced by real connection diagnosis).

## 2. What each batch shipped (files)

**Batch 1 — data/derivation/API** ·
[supabase/migrations/20260723000000_user_onboarding_states.sql](../../../supabase/migrations/20260723000000_user_onboarding_states.sql) ·
[contracts/onboarding.ts](../../../contracts/onboarding.ts) ·
[repositories/onboarding/userOnboardingStates.ts](../../../repositories/onboarding/userOnboardingStates.ts) ·
`hasSucceededRunServiceRole` in [repositories/workflowRuns.ts](../../../repositories/workflowRuns.ts) ·
[services/onboarding/](../../../services/onboarding/) (`onboardingFlags`, `checklistDerivation` (pure), `checklistState`, `completionLatch`) ·
[app/api/onboarding/route.ts](../../../app/api/onboarding/route.ts) (GET) ·
[app/api/onboarding/presentation/route.ts](../../../app/api/onboarding/presentation/route.ts) (POST) ·
[lib/api/onboarding.ts](../../../lib/api/onboarding.ts) ·
latch call in [app/api/workflows/[id]/activate/route.ts](../../../app/api/workflows/[id]/activate/route.ts).

**Batch 2 — UI** · [features/onboarding/](../../../features/onboarding/)
(`OnboardingChecklist` orchestrator, `OnboardingChecklistCard`, `OnboardingStepRow`,
`OnboardingCreateChooser`, `OnboardingWorkflowPicker`, `OnboardingMinimizedBar`,
`OnboardingSuccessCard`, `OnboardingProgressRing`, `onboardingIcons`, `onboardingCopy`,
`utils/stepDestinations`, `hooks/useOnboardingChecklist`) · dashboard slot +
empty-state handoff in [features/workflows/WorkflowsDashboard.tsx](../../../features/workflows/WorkflowsDashboard.tsx) ·
server fetch in [app/workflows/page.tsx](../../../app/workflows/page.tsx) ·
"Getting started" in [components/app-shell/UserMenu.tsx](../../../components/app-shell/UserMenu.tsx)
(flag threaded server-side through AppShell → AppTopBar/AppMobileBar) ·
motion keyframes (motion-safe only) appended to [app/globals.css](../../../app/globals.css).

**Batch 3 — deep links** ·
[features/apps/useProviderHighlight.ts](../../../features/apps/useProviderHighlight.ts) +
AppsDashboard/AppCard highlight + server validation in [app/apps/page.tsx](../../../app/apps/page.tsx) ·
[features/workflow-builder/hooks/useInitialBuilderFocus.ts](../../../features/workflow-builder/hooks/useInitialBuilderFocus.ts) +
`focusPulse` in BuilderHeader + `initialFocus` prop threading + `?focus=` parsing in
[app/workflows/[id]/page.tsx](../../../app/workflows/[id]/page.tsx).

**Batch 4 — analytics/video/e2e** ·
[supabase/migrations/20260724000000_onboarding_events.sql](../../../supabase/migrations/20260724000000_onboarding_events.sql) ·
[repositories/onboarding/onboardingEvents.ts](../../../repositories/onboarding/onboardingEvents.ts) ·
[services/onboarding/onboardingEvents.ts](../../../services/onboarding/onboardingEvents.ts) (sanitizing fail-open recorder) ·
[app/api/onboarding/events/route.ts](../../../app/api/onboarding/events/route.ts) ·
[features/onboarding/OnboardingVideoModal.tsx](../../../features/onboarding/OnboardingVideoModal.tsx) +
video config accessor + threading ·
[tests/e2e/onboarding-checklist.spec.ts](../../../tests/e2e/onboarding-checklist.spec.ts) +
`ENABLE_ONBOARDING_CHECKLIST` in the e2e webServer env.

## 3. Migrations and table shapes

- **`user_onboarding_states`** (`20260723000000`) — PK `(user_id, account_id)`;
  `selected_workflow_id` FK → workflows ON DELETE **SET NULL**;
  `completion_workflow_id` FK → workflows ON DELETE **SET NULL** (deleting the
  workflow never erases `completed_at`); presentation timestamps
  (`first_shown_at`, `dismissed_at`, `minimized`, `video_watched_at`,
  `celebrated_at`) + server-latched `completed_at`; `set_updated_at` trigger.
  **RLS/GRANTs:** `authenticated` = SELECT only, policy `user_id = auth.uid()
  AND` account-membership EXISTS (a removed member loses visibility);
  **no authenticated write path at all** — all writes via the service-role
  repository behind the authed routes. **No per-step completion booleans exist
  and must never be added** (table header comment enforces the honesty rule).
- **`onboarding_events`** (`20260724000000`) — CHECK-constrained event
  taxonomy, `step_key` CHECK, workflow/provider-key columns, allow-listed
  `metadata` jsonb; service-role-only in both directions (no authenticated
  grant; deny-shaped SELECT policy documents intent); indexed by
  `(account_id, created_at)` and `(event_type, created_at)`.
- **NEITHER migration has been applied anywhere** — `db:push` was prohibited
  for this slice. Owner step before enabling the flag: apply both to the dev DB
  (`npm run db:push`), later to prod with the normal deploy process.

## 4. Checklist derivation — exact source per step

| Step | Source of truth (no parallel logic added) |
|---|---|
| Create | `workflowsRepo.listByAccountServiceRole` — ≥1 non-deleted workflow |
| Connect | `diagnoseWorkflowConnections(...).allRequiredConnected` ([services/diagnostics/integrationConnection.ts](../../../services/diagnostics/integrationConnection.ts)) — requires ≥1 node (an empty graph is never "fully connected"; `add_steps_first` blocked state); per-provider entries carry `ready`/`reconnectNeeded`/role-aware `canConnect`; `admin_required` derives from account-class + not-connectable |
| Configure | `checkWritePathReadiness(draftDefinition) === null` ([services/workflows/executionReadiness.ts](../../../services/workflows/executionReadiness.ts)) — the same rule that gates activation |
| Test | `workflow_runs` row with `status='succeeded'` for the selected workflow (test OR live; failed/running/queued/missing never count) via `hasSucceededRunServiceRole` |
| Activate | selected workflow `state === "active"` exactly (draft/paused/disabled/eligible_to_resume/deleted never) |
| Overall | latched `completed_at` (below) |

Selected workflow: persisted pointer when valid → else most-recently-updated
non-deleted workflow → else none (Step 1); user-switchable via the picker;
auto-repoints (best-effort persist) when deleted; cross-account selection
collapses to the standard no-leak 404.

## 5. Completion latch + provenance

- **Where:** the activate route's `runLifecycle` SUCCESS callback (after
  readiness 422 gate + `tryRegisterTrigger` + persisted transition) calls
  `latchOnboardingCompletionOnActivation` — flag-gated, best-effort (service
  swallows its own errors with a message-only log; a latch failure can never
  fail or alter the successful activation response). Never called on
  blocked/failed activations; never client-driven.
- **How:** single-winner conditional update (`completed_at IS NULL`) sets
  `completed_at` + `completion_workflow_id` once; concurrent/later activations
  update zero rows (repository returns whether this call won, which also
  gates the one-time `onboarding_completed` event — no double counting).
  Presentation fields are untouched; provenance is immutable; FK SET NULL on
  workflow deletion preserves `completed_at`.
- **Evidence latch (existing users / co-members):** derivation-time — any
  account workflow with `state ∈ {active, paused, disabled,
  eligible_to_resume}` **or** `active_revision_id IS NOT NULL` proves prior
  activation. **Verified in code:** `applyTransition` writes
  `active_revision_id` only when explicitly passed
  ([repositories/workflows.ts:572](../../../repositories/workflows.ts)) and
  pause/disable transitions never pass it, so it persists; activation with a
  failed revision snapshot leaves it NULL, which the state-set arm covers —
  the OR is required, either arm alone under-counts. Silent latch (stamps
  `celebrated_at`) when the user never saw the checklist → no first-time
  celebration for pre-existing accounts; a user who HAS seen it gets the
  normal one-time success state.

## 6. Existing users / automated triggers / isolation / concurrency

- **Existing accounts:** no backfill job. Ever-activated accounts silently
  latch on first evaluation and never see the card; draft-only accounts get a
  mid-progress checklist; empty accounts start at Step 1.
- **Automated-trigger workflows:** no fake test. Step 4 copy becomes
  "Activate your workflow, and we'll confirm this step after its first
  successful run", activation completes the launch goal, and the step shows
  "Waiting for the first successful run" until a real succeeded run exists.
- **Isolation:** state keyed `(user_id, account_id)`; every route resolves the
  account via `requireUserWithAccount`; RLS = own-row + current-membership;
  writes service-role only; `select_workflow` membership-checked with no-leak
  404; the DTO carries ids/names/state/provider keys/booleans only (no config,
  tokens, scopes, provider account ids, member identities) — locked by
  no-leak tests.
- **Concurrency:** first activation wins the conditional latch; later/parallel
  activations are no-ops (proven at the repo semantics + route tests).

## 7. Navigation primitives

- **`/apps?highlight=<provider>`** — server-validated against the caller's own
  rendered catalog (unknown → silently ignored); one-shot scroll +
  ~2.6s ring + programmatic focus on the card; param consumed via
  `history.replaceState`; **never** auto-starts OAuth or bypasses APPS-PERM-1
  (connect/reconnect stay explicit gated clicks).
- **`/workflows/[id]?focus=setup|test|activate`** — validated in the page,
  threaded as `initialFocus`; one-shot post-hydration effect
  (`useInitialBuilderFocus`): `setup` computes the first incomplete node/field
  via `collectBuilderValidationIssues` (the existing rule) and calls
  `configSlice.revealNode` (navigation-only by contract); `test`/`activate`
  ring the existing header run/lifecycle controls for ~2.6s. Ref-guard + param
  consumption make re-renders and back/forward/reload safe; disabled in
  anonymous local-only mode; never saves, runs, activates, or mutates the
  graph (asserted by tests).

## 8. Analytics

In-house fail-open ledger (`ai_cost_events` pattern). Server-recorded:
`onboarding_shown` (first-shown latch), `onboarding_completed` (both latch
paths, single-winner-gated, with `silent` + integer `minutes_from_first_shown`),
`onboarding_dismissed`/`reopened`/`minimized`/`workflow_switched`/`video_watched`
(presentation route). Client-originated via the strict events route only:
`onboarding_cta_clicked` (step key + `creation_path` agent/template/manual) and
`onboarding_video_opened`. The recorder re-sanitizes everything (allow-listed
metadata keys, pattern-checked keys, integers rounded); nothing content-bearing
can pass. `onboarding_step_completed` is in the schema taxonomy but **not
emitted in v1** — per-step completion timestamps are derivable retrospectively
from the source tables (below), and emitting "newly complete" would require
stored per-step state, which the honesty rule forbids.

**Owner funnel queries (v1, run with service-role SQL):**

```sql
-- Funnel counts per week (shown → completed)
select date_trunc('week', created_at) wk, event_type, count(*)
from onboarding_events group by 1, 2 order by 1, 2;

-- Median minutes from first shown to completion
select percentile_cont(0.5) within group (order by (metadata->>'minutes_from_first_shown')::int)
from onboarding_events where event_type = 'onboarding_completed'
  and metadata ? 'minutes_from_first_shown';

-- Creation-path → activation rate (which entry converts best)
with ctas as (
  select account_id, metadata->>'creation_path' path
  from onboarding_events where event_type = 'onboarding_cta_clicked' and step_key = 'create'
), done as (select distinct account_id from onboarding_events where event_type = 'onboarding_completed')
select path, count(distinct c.account_id) started,
       count(distinct d.account_id) completed
from ctas c left join done d using (account_id) group by 1;

-- Step-level truth (no step events needed): create/connect/test timestamps
-- come from workflows.created_at, integrations.created_at, and the first
-- succeeded workflow_runs row per account; join on account_id as needed.

-- Dismiss/reopen + video engagement
select event_type, count(*) from onboarding_events
where event_type in ('onboarding_dismissed','onboarding_reopened',
                     'onboarding_video_opened','onboarding_video_watched')
group by 1;
```

## 9. Video

The imported design has no video surface, so the modal is a minimal
house-pattern dialog (hand-rolled, `role="dialog"`/`aria-modal`, Esc +
overlay close, focus moved in, native `<video controls>` for keyboard,
`<track kind="captions">`). Config: `ONBOARDING_VIDEO_URL` (+ optional
`ONBOARDING_VIDEO_CAPTIONS_URL`) — unset ⇒ the entire surface (footer link
"See how it works — 1 min") is hidden; the asset is replaceable by
re-uploading at the same URL without a deploy. Watched recorded once at
ended/≥90% → `video_watched_at`; **never** completes a step or gates
anything (test-asserted). No video asset was produced in this slice.

## 10. Tests and gates (all results are from actual runs)

- `npx tsc --noEmit` — **clean**.
- `npm run lint` — **0 errors**, 18 warnings repo-wide (16 pre-existing
  `max-lines`; `AppCard.tsx` + `BuilderHeader.tsx` sit at the warning
  threshold after this slice's additions — warnings, not errors).
- `npm run lint:structure` — **OK** (`repositories/onboarding/` subfolder keeps
  the 50-file leaf cap).
- `npm run lint:migrations` — **OK** (same-file RLS + GRANT coverage).
- Onboarding-focused Jest (units + routes + components + dashboard + apps +
  builder-focus + activate-route): **100 onboarding tests + 94 batch-1-adjacent
  + 14 deep-link tests green** across the batch runs; broader regression
  sweeps: `tests/unit/features/workflows` + `tests/unit/components/app-shell`
  = 279 green; `tests/unit/features/workflow-builder` +
  `tests/unit/features/apps` + `tests/integration/features/workflow-builder`
  = 2422 green with **5 pre-existing failures reproduced byte-identically at
  HEAD with this slice's changes stashed** (WorkflowCanvas action bar, notion
  list-comments config, variable-picker file-array — unrelated).
- Full `npm test` — run at the end of the slice: **25,315 passed / 124 failed /
  80 skipped (2,256 suites passed, 52 failed)**. Every failing suite was
  attributed: ~35 are the DB-backed integration/security/migrations suites,
  which run against the hosted dev project in this environment and fail on the
  same project-level captcha enforcement that blocks all UI/password sign-in
  (plus `user-onboarding-states-rls`, which additionally needs the unapplied
  migration); the rest are pre-existing local failures **verified unrelated**
  by re-running with the baseline (`ce1e60d35`) code — including
  `workflowRuns.listByAccountForDisplay`, `staleWorkflowRunSweep`,
  `buildWorkflowFailurePayload`, `dispatch-idempotency` (fail identically with
  my `workflowRuns.ts` reverted), the builder-config/WorkflowCanvas/
  variable-picker set, and the two structure suites whose remaining entries
  point only at pre-existing `features/auth` turnstile imports and old
  token-shaped literals in five untouched test files. The two failures this
  slice DID introduce (AppShell components→services boundary; a token-shaped
  literal in the new events test) were fixed in commit `cacb2ce61`, after
  which the components-boundary arm and all 171 onboarding/app-shell tests +
  2,080 app/workflows/apps tests are green.
- **RLS integration suite** (`user-onboarding-states-rls.test.ts`) — written,
  **self-skipped** in this environment (`ALLOW_DB_INTEGRATION_TESTS` not set;
  would also require the migration to be applied first).
- **E2E** ([tests/e2e/onboarding-checklist.spec.ts](../../../tests/e2e/onboarding-checklist.spec.ts))
  — authored (full journey + reconnect-regression/automated-trigger bad paths)
  and **executed with `--workers=1`, currently red for environmental reasons**:
  (a) the hosted Supabase project enforces captcha on sign-in, which fails the
  established `slice-1-slack-walkthrough.spec.ts` identically (verified this
  session), and (b) the two onboarding migrations are intentionally unapplied
  (`db:push` prohibited). Owner step: apply migrations to the e2e/dev DB +
  restore the e2e captcha bypass, then run
  `npx playwright test tests/e2e/onboarding-checklist.spec.ts --workers=1`.
- Production smoke — **not run** (no deploy happened; nothing changed in prod).

Remaining bad paths not in the e2e spec (member admin-required copy, forged
completion, latch-failure-never-fails-activation, cross-account isolation,
failed/running runs never completing) are covered at the unit/route/component/
RLS layers listed above.

## 11. Visual verification

Live-app verification was blocked by the same environment constraints as the
e2e run (captcha sign-in + unapplied migrations), so verification used a
static harness rendering the REAL components (`renderToStaticMarkup` + the
app's compiled Tailwind, dark app surface) side-by-side with the imported
`Onboarding.html` rendered in Chromium, screenshotted at 1280×900 / 520px /
390×844 (session scratchpad `visual/shots/`). States compared: full untouched
card, mid-progress (provider chips + picker + video link), blocked
(admin-required), minimized pill, success, narrow viewport. Result: card
geometry (18px radius, gradient + inset ring), header hierarchy, 3px gradient
progress bar, 26px step marks, active-row treatment, done strikethrough +
uppercase tag, footer ghost buttons, and the pill all read as the design.

**Intentional differences (documented):** inline dashboard placement above the
stat cards instead of the design's fixed bottom-right float (locked task
requirement; no persistent floating chrome); reopen lives in the user menu
instead of the floating "Setup guide" pill; the "Working on" picker row and
blocked-state chips (admin/reconnect/waiting) are additions the design's demo
had no equivalent for; "Mark done" and the "about 4 min left" estimate were
removed (honesty); the success copy is the required product copy naming the
real completion workflow; step icons swap the demo's Webhook/Share for
Settings/Sparkle to fit the real configure/activate steps.

## 12. Deferred / follow-ups

1. **Apply both migrations to the dev DB** (`npm run db:push`) before flipping
   the flag anywhere; then run the RLS suite (`ALLOW_DB_INTEGRATION_TESTS=true`)
   and the onboarding e2e spec.
2. E2E captcha: the hosted project's captcha setting currently blocks ALL UI
   sign-in e2e (pre-existing, slice-independent) — needs an owner decision
   (test keys or a dedicated e2e project).
3. Produce the actual 60–90s video asset + captions; set
   `ONBOARDING_VIDEO_URL`/`ONBOARDING_VIDEO_CAPTIONS_URL`.
4. Optional later batch (explicitly not v1): floating builder mini-pill;
   PostHog mirroring of the same event names; `onboarding_step_completed`
   emission if stored step-state ever becomes acceptable.
5. `AppCard.tsx` / `BuilderHeader.tsx` sit at the `max-lines` warning
   threshold — candidates for the next refactor touching those files.
