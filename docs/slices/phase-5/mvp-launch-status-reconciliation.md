# ChainReactV2 MVP Launch Status Reconciliation

## Date

2026-07-03. Branch `v2-main`, local `HEAD` @ `141fd5789` (local commits only, not
pushed).

## Purpose

This is a **docs/status reconciliation, not a build slice.** No source, tests,
migrations, schema, or UI were changed. It exists because several launch-readiness
docs still frame items as **open blockers / undecided** that Marcus has since
**decided** or that later local commits have already **fixed**. Left uncorrected,
a future session re-reading those docs would chase already-settled questions
(e.g. "should the React Agent ship on or off?", "is the dedup fail-open still a
risk?") and mis-report launch status.

Scope of this doc: reconcile the launch **status** across
[`mvp-launch-readiness-audit.md`](./mvp-launch-readiness-audit.md),
[`staging-environment-plan.md`](./staging-environment-plan.md),
[`webhook-dedup-idempotency-closeout.md`](./webhook-dedup-idempotency-closeout.md),
[`billing-production-readiness-closeout.md`](./billing-production-readiness-closeout.md),
and the React Agent / Hermes closeouts, against **current code**. Where code
contradicts an assumed status, that is called out honestly rather than papered over.

**Not in scope (owned elsewhere, not duplicated here):** live per-provider
OAuth/action/trigger certification and broad live-QA — a **separate chat** owns that
arc. It is listed below only as an external dependency.

## Owner decisions now locked

These were open/undecided in the audit; they are now settled and should be treated
as decided in all launch docs:

1. **React Agent is intended to be VISIBLE for MVP launch.** The builder left-rail
   React Agent (`BuilderGuidanceRail` → `WorkflowGuidancePanel`) ships visible.
2. **Hermes is an expected launch feature.** The gateway path
   (`isHermesAgentEnabled()` + the Render AI gateway) is intended ON in production.
   Enabling it is an env-config action (`HERMES_AGENT_ENABLED=true` + gateway URL/token
   in the prod scope), the same class of ops task as setting the Stripe keys — not a
   code change and not an undecided product question.
3. **The deterministic "Check workflow" checker is an expected launch feature.** It is
   already fully deterministic / local / zero-credit / no-LLM (the BUILDER-AGENT-RAIL
   arc), and renders inside the React Agent rail. With the rail visible (decision #1),
   the checker is visible.
4. **Staging is intentionally deferred for business reasons.** A full plan exists
   ([`staging-environment-plan.md`](./staging-environment-plan.md)); standing it up is a
   deliberate owner decision to defer, not an active next task. Launch proceeds
   **production-first** as an accepted risk (see Accepted risks).
5. **Live-provider validation is owned by a separate chat.** This doc and the audit do
   not re-do or duplicate that certification.

### Evidence these decisions do not contradict current code

- **React Agent rail visibility** — `features/workflow-builder/panels/BuilderGuidanceRail.tsx`
  renders the live chat panel when `guidanceEnabled === true && accountId` is present;
  `guidanceEnabled` is the server-evaluated `isHermesAgentEnabled()`. With Hermes ON and
  an account resolved, the rail is visible. No code path force-hides it.
- **Hermes flag** — `services/ai-guidance/gateway/gatewayConfig.ts:54`
  (`isHermesAgentEnabled()` reads `HERMES_AGENT_ENABLED === "true"`). The code default is
  OFF, which is only a **safe default** (like unset Stripe keys); it is flipped by env
  config, not code. `getHermesAgentGatewayConfig()` returns a live config once the flag +
  gateway URL/token are set. Per `docs/PROJECT_MEMORY.md`, the gateway is already
  configured + healthy and the flag is set locally; production is an env-set step.
- **Deterministic checker** — the "Check workflow" review is deterministic and LLM-free
  (`core/workflows/checkWorkflowReview.ts`), reached through the rail. It never calls
  Hermes/OpenAI and costs no credits.

**Honest nuance (not a blocker):** the deterministic checker is reached **inside** the
Hermes-gated rail, so if Hermes were ever turned OFF the free checker would hide with it.
Because Hermes is an expected launch feature (decision #2), this coupling is moot for
launch. Optionally decoupling the zero-credit checker from the Hermes flag remains a small
nice-to-have (was audit item `REACT-AGENT-CHECK-DECOUPLE-1`), not a launch blocker.

## Completed launch-risk fixes

Already fixed locally (commits on `v2-main`, unpushed):

1. **Webhook dedup fail-safe — `19c00455f`** (`fix(webhooks): fail safe on dedup outage
   before enqueue`). The previously-documented **fail-open** dedup-outage policy (which
   relied on a downstream Q4 backstop that did **not** exist) now **fails CLOSED**: when
   the dedup store is unavailable, the dispatcher **skips enqueue** before any run is
   created and emits a `webhook_dedup_unavailable_skip_enqueue` alert. An outage can no
   longer double-run a workflow. See
   [`webhook-dedup-idempotency-closeout.md`](./webhook-dedup-idempotency-closeout.md).
   **Residual (deferred, not a blocker):** the general Q4 within-session
   `session_side_effects` storage still does not exist. It is only load-bearing once
   **auto-retry / resume-from-failed-node** ships (both deferred), and must land
   (`DEDUP-BACKSTOP-1`) before either.
2. **Billing production readiness — `141fd5789`** (`fix(billing): harden production
   readiness checks`). Platform billing code was audited and one robustness gap fixed
   (Stripe Basil `current_period_end` now resolved from top-level OR item-level, so the
   "Manage billing" portal button syncs). The billing system is account-scoped,
   signature-verified, idempotent, and fails **closed** on every missing-config path. See
   [`billing-production-readiness-closeout.md`](./billing-production-readiness-closeout.md).
   **Status: ready pending Marcus dashboard verification** (list below) — it is **not**
   fake/copy-only; the code is real and wired.

### Billing dashboard verification list (the gate to enabling payments)

All are dashboard/env config, not code (from the billing closeout §"What Marcus must
verify"):

1. Vercel prod env vars set: `STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`, all six
   per-plan price ids (`STRIPE_PRICE_{PRO,TEAM,BUSINESS}_{MONTHLY,ANNUAL}`),
   `NEXT_PUBLIC_APP_URL` = prod origin, and `STRIPE_API_BASE` **unset** in prod.
2. Same Stripe **mode** for the secret key and every price id (both live, or both test for
   a rehearsal). Code cannot detect a cross-mode mix.
3. Displayed prices == the configured Stripe price amounts ($25/$19, $75/$59, $249/$199).
4. Webhook endpoint `/api/webhooks/stripe-billing` subscribed to exactly
   `checkout.session.completed` + `customer.subscription.{created,updated,deleted}`, with
   its signing secret == `STRIPE_BILLING_WEBHOOK_SECRET`; note its API version.
5. Customer Portal config decision: allow **payment-method update + cancel only**; route
   plan changes through the in-app upgrade panels (else a portal-initiated plan switch
   won't re-sync `plan`/`tasks_limit`).
6. Billing migrations applied to the prod DB (`account_billing` foundation + plan_metadata
   + stripe_attachment + stripe_billing_events + ai_credits + internal_entitlement +
   lazy_task_period_rollover).
7. Run one live (or test-mode) checkout → webhook → portal round-trip
   (overlaps the separate chat's `LAUNCH-LIVE-QA-1`).

## Still open before launch

Only genuine, current open items (staging and provider-validation removed — see Accepted
risks / external dependency):

1. **Billing dashboard verification** (list above) — the operational gate to enabling
   payments. Code is ready.
2. **Prod configuration confirmation** beyond billing: `OAUTH_STATE_SIGNING_KEY` /
   `ANON_AI_LIMIT_SIGNING_KEY` present, `TOKEN_ENCRYPTION_KEY` 32 bytes, and — for the
   locked React Agent decision — `HERMES_AGENT_ENABLED=true` + gateway URL/token set in the
   prod scope.
3. **Cross-device email-confirmation Supabase template + URL config** applied and smoked on
   two devices (code path is live; the template change is the missing half).
4. **Confirm the applied-migration list** on the prod DB (`qcepijemjlkssfkvzlio`) matches
   the repo before/at launch.
5. **Push the launch cut.** Local `v2-main` is many commits ahead of `origin`; choose the
   batch and push a verified set (pushing `v2-main` deploys to prod).

## Accepted risks

Signed-off, production-first launch risks (documented, not open tasks):

- **No staging environment (production-first launch).** One Supabase project
  (`qcepijemjlkssfkvzlio`) serves dev and prod, so migrations debut on prod. A full staging
  plan exists ([`staging-environment-plan.md`](./staging-environment-plan.md)) and is
  **intentionally deferred by owner decision**. Mitigation while deferred: take a verified
  prod DB backup before each migration and follow a migration-application checklist.
- **Dropped webhook events during a dedup-store outage.** By design of the fail-closed fix
  (`19c00455f`): events arriving while `webhook_event_dedup` is unavailable are shed (not
  enqueued, not retried), bounded to the outage window and loudly logged. This is the
  deliberate trade vs. duplicate irreversible side effects.
- **Two providers lack cryptographic webhook signature verification** — Mailchimp (URL
  secrecy + audience id + dedup) and Microsoft Graph (`clientState` string-equality, no
  replay window). MVP-tolerable; ensure those secrets are high-entropy and never logged.
- **No `invoice.payment_failed` handling** — failed renewals surface via the subsequent
  `subscription.updated → past_due` banner; explicit dunning is post-launch.
- **CI does not run the DB-gated RLS/isolation + Playwright e2e suites** (no test Supabase
  project yet). High severity but can trail launch behind a manual pass.

## External dependency: live-provider validation

A **separate chat owns** live per-provider OAuth connect/refresh/revoke, webhook
delivery+dedup round-trips, Stripe live checkout/webhook, and durable-queue live-e2e
certification (the action-smoke / trigger-smoke arc). This doc does **not** duplicate it.
It is a shared prerequisite for opening broader signups, listed here only so status is
complete. Do not re-scope that work into this reconciliation.

## Stale claims corrected

| Stale claim | Where found | Corrected status | Evidence |
|---|---|---|---|
| "A few explicit go/no-go decisions remain: whether the AI builder rail ships on or off." | `mvp-launch-readiness-audit.md` Executive summary #4; must-fix #5 | **Decided:** React Agent ships visible; Hermes + deterministic checker are expected launch features. Enabling Hermes is an env-config step, not an open decision. | `BuilderGuidanceRail.tsx` (renders when `guidanceEnabled && accountId`); `gatewayConfig.ts:54`; owner decision |
| React Agent rail "gated off by default … whole rail collapses to unavailable; the free deterministic checker is hidden with it" framed as an undecided **Medium blocker**. | `mvp-launch-readiness-audit.md` Builder/AI row | **Not a blocker.** OFF is only a safe default; the launch decision is Hermes ON → rail + checker visible. Checker/Hermes coupling noted as an optional decouple, not a blocker. | Same as above; checker is deterministic (`core/workflows/checkWorkflowReview.ts`) |
| "No staging environment … the single biggest risk … top structural gap / must-fix #1 / Blocker." | `mvp-launch-readiness-audit.md` blocker table row 1 + must-fix #1 | **Accepted risk (production-first), intentionally deferred by owner decision.** Plan exists; not an active next task. | `staging-environment-plan.md`; owner decision |
| Dedup "fail-open; the documented downstream Q4 backstop is not implemented → duplicate side effects possible." | `mvp-launch-readiness-audit.md` Execution row (already annotated RESOLVED) | **Fixed:** fails **closed** before enqueue when dedup unavailable. Residual = general Q4 storage, deferred before auto-retry/resume. | commit `19c00455f`; `webhook-dedup-idempotency-closeout.md`; `services/triggers/dispatch.ts` |
| Billing "depends on prod env vars … Blocker (only if taking payments)" with no closeout. | `mvp-launch-readiness-audit.md` Billing row | **Code ready pending Marcus dashboard verification** (list above). Real + wired, not copy-only. | commit `141fd5789`; `billing-production-readiness-closeout.md` |
| "CLAUDE.md §'Task Cost Visibility & Billing' describes the V1 billing/cron model (report-overage, usage-alerts, clean-session-side-effects, reset-task-usage)." | `mvp-launch-readiness-audit.md` Docs/Ops row | **Partly stale:** the **V2** `CLAUDE.md` has **no** such section (that section lives in the V1 repo's CLAUDE.md). The stale V1 billing/cron content in V2 is in the **roadmap** Phase 7, corrected there. V2's actual monitored crons contain no billing/overage crons. | V2 `CLAUDE.md` (no billing-cron section); `services/observability/cronExpectations.ts:17-27`; `docs/roadmap/chainreact-v2-roadmap.md:314,388` |
| Roadmap Phase 7: "Port V1's plans + packs + overage + auto-buy + report-overage/usage-alerts crons faithfully." | `docs/roadmap/chainreact-v2-roadmap.md:306-388` | **Superseded:** V2 shipped a **reserve/reconcile + `account_billing` + AI-credits** model. No overage/pack/auto-buy crons exist; the billing cron surface is `release-expired-reservations` only. | `billing-production-readiness-closeout.md`; `services/billing/*`; `cronExpectations.ts` |

## Files changed

- **New:** `docs/slices/phase-5/mvp-launch-status-reconciliation.md` (this doc).
- **Correction notes added (short, targeted):**
  - `docs/slices/phase-5/mvp-launch-readiness-audit.md` — status-reconciliation banner + row
    notes (React Agent decided, staging = accepted risk, billing closeout pointer).
  - `docs/roadmap/chainreact-v2-roadmap.md` — Phase 7 "superseded by V2 reserve/reconcile"
    banner.
  - `docs/PROJECT_MEMORY.md` — one durable-decision line (React Agent visible / Hermes +
    checker expected / staging deferred / billing ready-pending-verify).
- **Reviewed, no change needed:**
  - `CLAUDE.md` (V2) — no stale V1 billing/cron section; "no staging env yet" is accurate.
  - `docs/rules/testing-strategy.md` — already corrected to fail-closed dedup (line 166).

## Commands run

Docs-only. Read-only repo/code verification:

- `git log --oneline -1` → `141fd5789`; branch `v2-main`.
- `git log --oneline -1 19c00455f` → `fix(webhooks): fail safe on dedup outage before
  enqueue` (confirmed present).
- `git log --oneline -1 141fd5789` → `fix(billing): harden production readiness checks`
  (confirmed present).
- Read: `BuilderGuidanceRail.tsx`, `gatewayConfig.ts`, `cronExpectations.ts`, the four
  launch docs, roadmap Phase 7, testing-strategy dedup section.

**No** code tests were run in this slice (docs-only). No push, no deploy, no `db:push`, no
migration. Verification baselines cited above are inherited from the referenced closeouts,
not newly measured here.
