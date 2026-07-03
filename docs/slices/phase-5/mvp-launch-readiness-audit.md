# ChainReactV2 MVP Launch Readiness Audit

## Audit date

2026-07-03.

Latest evidence dates cited below run to `origin/v2-main` @ `fd30e9cb5` (2026-06-30)
and local `HEAD` @ `dafa240dd` (28 commits ahead). Where the environment shows
later curation dates (e.g. `docs/PROJECT_MEMORY.md`), findings cite the commit/doc,
not the wall clock.

## Scope

This is an **audit only**, not an implementation slice. No source, tests, migrations,
schema, or UI were changed. Nothing was pushed, deployed, `db push`-ed, or PR'd. The
report is a read-only, evidence-backed assessment of what remains before a **credible
MVP** — not a perfect v1. Enterprise/future-scope items are called out only where they
affect launch safety, security, billing, core execution, onboarding, or production ops.

Per the task brief, **live per-provider action/trigger testing is owned by a separate
chat** and is treated here as an external dependency, not re-done.

Important framing: **ChainReactV2 is already LIVE in production** at
`https://chainreact.app` (deploying from `v2-main`). So the real question this audit
answers is not "can we turn it on?" but **"is it safe and credible to open signups /
broader rollout and take payments?"**

## Executive summary

**Verdict: Not ready, but close.**

The *code* is in genuinely good shape. Across execution, billing, security, the
account-ownership model, and ops/observability, the audit found real, wired, tested
implementations — no fabricated UI, no backend-less buttons, no fake providers, and
no correctness launch-blockers in the core user journey. Static gates are green
(typecheck, structure lint, migration RLS/GRANT lint, provider-metadata consistency,
latest prod smoke).

What is **not** ready is **launch-safety verification and operational posture**, and a
few explicit product/config decisions:

1. **No staging environment.** A single Supabase project (`qcepijemjlkssfkvzlio`)
   serves as both dev and prod, so migrations are applied directly against the
   production database with no rehearsal. This is the single biggest risk before
   taking payments.
2. **Live-provider validation is "Not started."** OAuth connect/refresh/revoke,
   webhook delivery+dedup, Stripe checkout/webhook round-trips, and durable-queue
   under real load are unverified against real credentials. (Per-provider action/trigger
   testing is the external chat's job — see that section.)
3. **CI does not run the highest-leverage safety nets.** RLS/account-isolation DB
   suites and all Playwright e2e are gated out of CI (no test Supabase project), so the
   exact behaviors most likely to fail silently in prod are not continuously proven.
4. **A few explicit go/no-go decisions** remain: whether the AI builder rail ships on
   or off; confirming Stripe/prod env vars are set; the cross-device email-confirm
   Supabase template change; and which of the 28 unpushed commits ship at launch.

None of these are architectural. They are the gap between "the code is built" and "we
have proven it's safe under real traffic and money." A focused live-QA + staging-DB +
config-confirm pass closes most of it.

## Launch blocker table

| Area | Finding | Why it matters | Evidence | Owner / suggested next slice | Severity | Status |
|---|---|---|---|---|---|---|
| Ops / DB | No staging environment; one Supabase project (`qcepijemjlkssfkvzlio`) is used as both dev and prod. Migrations are applied directly to the prod DB. | No safe place to rehearse migrations/data changes before they hit paying users. A bad forward-only migration hits prod first. | `docs/slices/phase-4/v2-go-live-status.md:16,127`; CLAUDE.md push-posture banner ("no staging env yet") | Stand up a dedicated staging Supabase project + `db push` V2 there; make migrations flow staging→prod. | Blocker (for taking payments) | confirmed |
| Testing | Live-provider validation not started: OAuth connect/refresh/revoke, webhook delivery+dedup, Stripe checkout/webhook round-trip, durable-queue live e2e all unverified against real creds. | These are the exact paths most likely to fail silently in prod; all are currently manual-QA-only. | `v2-go-live-status.md:124-126`; `PROJECT_MEMORY.md` open-risks (durable-queue live e2e pending) | Manual live-QA pass per critical path (OAuth refresh/revoke, one webhook provider end-to-end, one Stripe checkout+webhook, one durable-queue manual run). | Blocker | confirmed |
| Billing | Stripe checkout/portal/webhook are real and wired, but live enforcement depends on prod env vars (`STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`, per-plan price ids). All fail **closed** (503 / retry) when absent. | If payments are in scope at launch and the vars aren't set, checkout returns 503 `price_not_configured` — no revenue, confusing UX. | `services/billing/platformBillingSessions.ts:86-179`; `services/billing/stripeBillingWebhook.ts:239-287` | Ops task: confirm all Stripe secrets + price ids set in Vercel prod; run one live checkout+webhook round-trip. | Blocker (only if taking payments at launch) | needs verification |
| CI / Testing | CI runs tsc/eslint/structure/migrations/jest, but **all Playwright e2e and DB-gated RLS/isolation integration suites are excluded** (no test Supabase project). | The account-isolation / RLS behaviors that protect tenant data are not continuously verified; regressions could ship unnoticed. | `.github/workflows/ci.yml:20-28,65-78`; `docs/slices/.../v2-ready-0b-skipped-test-triage.md`; ~46 DB-gated integration suites self-skip | Stand up the test Supabase project (V2-READY-0C) and wire e2e + RLS suites into CI (can follow launch if a manual pass is done first). | High | confirmed |
| Auth | Cross-device email confirmation code path is live, but the Supabase email templates + URL config change is still pending (manual). Until then, confirming sign-up on a different device than sign-up can still fail. | "Sign up on desktop, confirm on phone" is a very common first-run path; failure kills onboarding for those users. | `v2-go-live-status.md:82-103` (verifyOtp path live; template change ⏳ pending) | Ops task: apply the two Supabase templates + URL config; run a real 2-device confirm smoke. | High | confirmed |
| Builder / AI | React Agent rail is **gated off by default** (`HERMES_AGENT_ENABLED` unset → whole rail collapses to an "unavailable" note). The free, LLM-free deterministic "Check workflow" pill is nested inside the gated panel and hidden with it. | Product decision: launch with no visible builder AI (fine, but the "React Agent" pitch is invisible) OR turn it on (lights up model spend, credit-gated). Either way the free validation-in-chat is currently hidden. | `services/ai-guidance/gateway/gatewayConfig.ts:54`; `features/workflow-builder/panels/BuilderGuidanceRail.tsx:123-185`; `WorkflowGuidancePanel.tsx:258-266` | Product decision + tiny slice: optionally decouple deterministic "Check workflow" from the Hermes flag so it's available with AI off. | Medium | confirmed |
| Execution | Duplicate-side-effect protection during a **dedup-store outage** is thinner than it looks. `webhook_event_dedup` was intentionally **fail-open**; the documented downstream Q4 backstop (within-session `checkReplay`/`recordFired` *storage*) is **not implemented** (only key/hash helpers ship). | During a dedup-store outage, a doubled provider webhook delivery → two distinct runs → duplicate side effects, with no cross-run idempotency to catch it. Narrow (outage-only) but real. | `services/triggers/dispatch.ts:54-69`; `core/workflows/idempotency.ts:1-9` (storage "deferred"); `docs/rules/webhook-receipt-routes.md` (fail-open locked) | Document as accepted risk; land `session_side_effects` storage before any auto-retry / resume-from-failed-node ships. | Medium | **RESOLVED 2026-07-03 (LAUNCH-DEDUP-FAILSAFE)** — dedup outage now fails **closed** (skip enqueue + `webhook_dedup_unavailable_skip_enqueue` alert) instead of fail-open, so an outage can no longer double-run a workflow. The missing Q4 storage remains a follow-up (`DEDUP-BACKSTOP-1`), needed before auto-retry/resume. See `webhook-dedup-idempotency-closeout.md`. |
| Security | Two providers lack cryptographic webhook signature verification: Mailchimp (no provider signature — relies on URL secrecy + audience id + dedup) and Microsoft Graph (`clientState` plain string-equality, no replay window). | Spoofed/forged webhook deliveries for those two providers are harder to reject; MVP-tolerable but should be a signed-off accepted risk. | Security agent scan of `app/api/webhooks/**` + `integrations/*/webhooks/receive.ts` | Document accepted risk; verify `clientState` secrets are high-entropy and never logged. | Medium | confirmed |
| Docs / Ops | CLAUDE.md and parts of the roadmap describe the **V1 billing/cron model** (report-overage, usage-alerts, clean-session-side-effects, reset-task-usage). V2 ships a different reserve/reconcile + `account_billing` + AI-credits model; those crons correctly do not exist. | Stale instructions cause future audits/engineers to chase phantom infrastructure and mis-assess billing readiness. | `services/observability/cronExpectations.ts:17-26` (actual `MONITORED_CRONS`); CLAUDE.md §"Task Cost Visibility & Billing" (V1 model) | Docs slice: reconcile CLAUDE.md/roadmap billing+cron sections to the V2 reserve/reconcile model. | Low | confirmed |
| Ops | Prod migration-application state cannot be confirmed from git. The repo has forward-only migrations through `20260718`; whether each is applied to the prod DB is unverifiable here (single shared project + memory claims, no staging to diff against). | If a migration the running code depends on was not applied, features degrade silently in prod. | `git diff origin/v2-main..HEAD -- supabase/migrations` (only `20260718_internal_admins` is local-only); `PROJECT_MEMORY.md` "applied to dev DB" notes | Ops: verify applied-migration list on `qcepijemjlkssfkvzlio` vs repo before/at launch. | Medium | needs verification |

## MVP must-fix list

Must be addressed before a credible MVP launch (broader signups / taking payments):

1. **Stand up a staging environment (or at minimum a staging Supabase project).** Migrations must not debut on the production DB. This is the top structural gap. (If a full staging env is out of scope for launch timing, at minimum document a migration-application checklist and take a verified backup before each prod migration.)
2. **Do a manual live-QA pass of the paths that have zero automated coverage:** OAuth connect + refresh + revoke for the top 2–3 providers; one webhook trigger delivered end-to-end (verify dedup); one durable-queue manual run finalizing; and — if taking payments — one Stripe checkout + webhook round-trip. These are "Not started" today.
3. **Confirm prod configuration:** Stripe secret + billing-webhook secret + per-plan price ids set in Vercel (billing fails closed otherwise); `OAUTH_STATE_SIGNING_KEY`/`ANON_AI_LIMIT_SIGNING_KEY` present (anonymous AI planning fails closed otherwise); `TOKEN_ENCRYPTION_KEY` 32 bytes.
4. **Apply the cross-device email-confirmation Supabase template + URL config change** and smoke it on two devices. The code path is live; the template change is the missing half.
5. **Make an explicit product decision on the React Agent rail** (`HERMES_AGENT_ENABLED` on vs off). Recommended: decouple the deterministic, zero-credit "Check workflow" from the flag so users get free validation-in-chat even if the LLM rail ships off.
6. **Decide what ships:** the 28 unpushed commits include the React Agent readiness wiring, internal-admin tooling, ops-alerts activation, and one migration (`internal_admins`). Choose the launch cut and push a verified batch.
7. **Sign off the accepted-risk items** in writing: ~~dedup fail-open (+ the not-yet-implemented within-session backstop)~~ **[RESOLVED 2026-07-03 — dedup outage now fails closed; see `webhook-dedup-idempotency-closeout.md`. Residual: land the Q4 `session_side_effects` backstop (`DEDUP-BACKSTOP-1`) before any auto-retry / resume-from-failed-node]**, Mailchimp / MS-Graph webhook verification limits.

## Should-fix soon after launch

Important, but not launch-blocking for a credible MVP:

- **Wire e2e + RLS/isolation suites into CI** once the test Supabase project exists (V2-READY-0C). Today they exist and are rich (22 provider walkthroughs) but never run in CI.
- **Land within-session `session_side_effects` storage** (`checkReplay`/`recordFired`). No live exposure today because there is no auto-retry, but it becomes load-bearing the moment auto-retry or resume-from-failed-node ships — and it is the backstop the dedup fail-open relies on.
- **Add sad-path and interactive-builder-authoring e2e** (missing-connection, handler-timeout, real drag-to-build). Current e2e is happy-path + mocked provider boundary.
- **Reconcile CLAUDE.md / roadmap** to the V2 billing + cron model (remove V1 overage/pack/usage-alert cron references).
- **Pre-run cost confirmation** — today there's a deterministic estimate in the builder but no blocking pre-run confirmation dialog. Fine at flat 1-task/run; revisit if per-node/loop pricing goes live.
- **Automatic retry/backoff** on transient provider failures (currently deferred; user must re-run manually).
- **AppCard reassurance copy** (reconnect/disconnect microcopy) — tracked, minor.

## Explicitly not required for MVP

These are future/enterprise/perfection items that should not distract launch:

- Teams/orgs UI, invitations, roles beyond `owner`, member management, account switcher UI (the account-ownership *data model* is already account-scoped and correct; the collaboration UI is a deliberate post-launch roadmap).
- Resume-from-failed-node, HITL pause/resume, parallel branch/loop execution, per-handler circuit breakers, 1000-run load test (Phase 6 hardening).
- Customer-facing observability/health dashboard (explicitly decided against; platform observability stays internal).
- Task packs / overage / auto-buy UI as a V1-style surface (V2 uses reserve/reconcile + AI credits instead).
- SAML/SSO, SCIM, multi-currency, DPA/enterprise legal, public API, cross-account transfer, per-resource ACLs.
- Mobile-optimized workflow builder canvas (shell + dashboards are already responsive; the node canvas is reasonably desktop-first for MVP).
- Redis dedup migration, streaming JSON parse for large webhook batches, replay-for-debugging admin endpoint.

## External dependency: provider action/trigger testing

A **separate chat owns live per-provider action and trigger testing** (the action-smoke / trigger-smoke certification arc). Current state from that work: provider **runtime is complete (26/26 providers, ~286 handlers)**, **builder metadata is 26/26**, provider-metadata consistency is clean (0 errors across 25 statically-parseable manifests), and the write-certification harness reports **298 registered actions / 119 LIVE_PASS / 0 fail / 0 stale** with write-COMPLETE coverage on Airtable, Google Drive, Google Sheets, and OneDrive.

**Launch impact:** provider *breadth* is not a launch blocker. The residual dependency is that **live OAuth + live per-provider round-trips against real credentials are still being certified** — that overlaps with must-fix #2 (live-provider validation). This audit does not duplicate that certification; it only flags that "green live-provider testing" is a shared prerequisite for opening signups. Do not treat "26/26 covered" as "all provider work verified in prod."

## Evidence reviewed

**Rule docs (docs/rules/):** workflow-lifecycle, failed-run-recovery, account-ownership-model, database-security, webhook-receipt-routes, testing-strategy (read in full); provider-registry, oauth-dispatcher, variable-resolver, file-output-contract, project-structure-and-module-boundaries (covered via code audit).

**Status / closeout docs:** `docs/PROJECT_MEMORY.md` (current status, durable decisions, open risks, recently-completed arcs); `docs/roadmap/chainreact-v2-roadmap.md` (noted as stale on provider front); `docs/slices/phase-4/v2-go-live-status.md`; `docs/slices/phase-4/provider-metadata-launch-gap-tracker.md`; `docs/slices/phase-5/react-agent-readiness-closeout.md`.

**Code paths (via four parallel verification agents), with representative file:line:**
- Execution: `services/execution/enqueue.ts`, `engine.ts`, `repositories/workflowRunsQueue.ts`, `workflowRunsLifecycle.ts`, `services/execution/runQueueProcessor.ts`, `app/api/cron/process-run-queue`, `sweep-stale-runs`, `services/triggers/dispatch.ts`, `services/oauth/refreshAndRetry.ts`, `core/errors/humanizeActionError.ts`, `runPersistence.ts`.
- Billing: `services/billing/executionBillingGate.ts`, `platformBillingSessions.ts`, `stripeBillingWebhook.ts`, `platformStripeClient.ts`, `repositories/accountBilling.ts`, `features/account/BillingSection.tsx`.
- Security/account: `core/encryption/tokens.ts`, `repositories/supabase/serviceRoleClient.ts`, `services/oauth/state.ts`, `repositories/oauthStates.ts`, `app/integrations/token-ingest/[provider]/page.tsx`, `contracts/file.ts`, `core/integrations/credentialSharing.ts`, `core/integrations/workflowCredentialScope.ts`, `services/accounts/activeAccount.ts`, migrations `20260627..20260701`, `tests/structure/no-authenticated-integration-grants.test.ts`.
- Ops: `services/observability/cronExpectations.ts`, `opsAlertEvaluator.ts`, `services/observability/delivery.ts`, `vercel.json`, `docs/runbooks/*`.
- Builder/journey: `app/auth/actions.ts`, `supabase/migrations/20260531000003_handle_new_user_account_billing.sql`, `services/oauth/dispatcher.ts`, `services/integrations/reconnect.ts` / `disconnect.ts`, `features/apps/AppCard.tsx`, `features/workflow-builder/config-modal/ConfigModalShell.tsx`, `hooks/useOptionsSource.ts`, `LifecycleActions.tsx`, `features/runs/RunRow.tsx`, `core/errors/failedRunCta.ts`, `features/workflow-builder/panels/BuilderGuidanceRail.tsx`.

## Verification commands run

Only read-only commands were run. Honest status:

**Ran (passed / results captured):**
- `git rev-parse` / `git fetch origin v2-main` / `git rev-list --count origin/v2-main..HEAD` → origin `fd30e9cb5` (2026-06-30); local `HEAD` `dafa240dd`; **28 commits ahead**.
- `git diff --name-only origin/v2-main..HEAD -- supabase/migrations/` → **only** `20260718000000_internal_admins.sql` is local-only; all other migrations are already in `origin/v2-main`.
- MCP `run_typecheck` (`tsc --noEmit`) → **exit 0**.
- MCP `run_structure_lint` (leaf-folder ≤50) → **exit 0, OK**.
- MCP `run_migration_lint` (RLS + GRANT on user-data tables) → **exit 0, OK**.
- MCP `provider_metadata_consistency_check` → **25 providers, 0 errors / 0 warnings / 0 unknown**; no cross-registry issues.
- MCP `list_recent_smoke_failures` → latest artifact `artifacts/mcp/smoke-latest.json` (2026-06-19): **24 passed / 0 failed / 8 skipped**; no failed/timed-out tests.
- MCP `generate_deploy_readiness_report` (advisory) → readiness `review_needed`, **no blockers, no warnings**; recommends the standard gate checks.

**NOT run (explicitly not claimed as passing):**
- `npm test` (full Jest suite) — **not run** (large; memory notes a small set of pre-existing individual failures — e.g. analytics `activeAccount` drift, `variable-picker-file-array` — plus ~181 intentionally DB-gated skips, not failures).
- `npm run lint` (broad eslint) — **not run** (memory notes ~12 pre-existing `max-lines` warnings, 0 errors).
- Playwright e2e (`test:e2e`) and `smoke:prod` — **not run** (require a test/prod session + creds not available here).
- Any live OAuth / provider / Stripe / webhook / durable-queue round-trip — **not run**.
- Any query against the prod DB (`qcepijemjlkssfkvzlio`) to confirm applied migrations — **not run** (no DB access; not attempted against prod).

## Recommended next slices

Prioritized, small, scoped prompts Marcus can hand to other chats:

1. **`LAUNCH-STAGING-DB-1` (Blocker).** Provision a dedicated staging Supabase project, `db push` V2 schema, repoint a preview/staging Vercel env at it, and document the staging→prod migration flow. Deliverable: migrations never debut on prod again.
2. **`LAUNCH-LIVE-QA-1` (Blocker).** Manual live-QA runbook + execution: OAuth connect/refresh/revoke for Slack + one Google + one Microsoft provider; one webhook trigger delivered end-to-end with dedup verified; one durable-queue manual run finalizing; (if taking payments) one Stripe checkout + webhook round-trip. Coordinate with the provider action/trigger testing chat to avoid overlap.
3. **`LAUNCH-PROD-CONFIG-1` (Blocker).** Verify + document all prod env vars (Stripe secret/webhook/price ids, signing keys, `TOKEN_ENCRYPTION_KEY`); apply the cross-device email-confirm Supabase templates + URL config and 2-device smoke it. Confirm the applied-migration list on `qcepijemjlkssfkvzlio`.
4. **`REACT-AGENT-CHECK-DECOUPLE-1` (Medium, product).** Decide `HERMES_AGENT_ENABLED` launch default; optionally decouple the deterministic zero-credit "Check workflow" from the Hermes flag so free validation-in-chat is available with the LLM rail off.
5. **`DEDUP-BACKSTOP-1` (Medium).** Land `session_side_effects` storage (`checkReplay`/`recordFired`) so the fail-open webhook dedup has a real cross-run backstop; gate before any auto-retry / resume-from-failed-node work.
6. **`CI-E2E-RLS-1` (High, can trail launch).** Once the test Supabase project exists, wire Playwright e2e + DB-gated RLS/isolation suites into CI; add a sad-path e2e.
7. **`DOCS-BILLING-CRON-RECONCILE-1` (Low).** Update CLAUDE.md + roadmap billing/cron sections to the V2 reserve/reconcile + AI-credits model; record the Mailchimp / MS-Graph webhook-verification accepted risks in a durable rule/runbook.
