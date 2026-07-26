# ChainReactV2 Production Config Owner Checklist

## Purpose

This is an **owner/CEO-facing launch checklist**, not an engineering audit. It lists
exactly what **Marcus must personally verify in dashboards and production** before saying
"launch" — the things that cannot be proven from code because they live in Vercel,
Supabase, Stripe, and provider dashboards.

It does **not** re-audit the code (that is done — see the closeouts in
[Files reviewed](#files-reviewed)) and it does **not** duplicate the separate chat's
live per-provider OAuth/action/trigger certification. Where an item overlaps that chat,
it is marked so you don't do it twice.

If everything in [Final launch-ready definition](#final-launch-ready-definition) is true
and no [Red-line no-go item](#red-line-no-go-items) is present, you can launch.

## Current launch posture

- **Already live in production** at `https://chainreact.app`, deploying from branch
  `v2-main`. So "launch" here means **opening broader signups and turning on payments**,
  not flipping the app on.
- **Code is in good shape.** Execution, billing, security, the account model, and
  ops/observability are real, wired, and tested. Static gates (typecheck, structure lint,
  migration RLS/GRANT lint, provider-metadata consistency, latest prod smoke) are green.
- **Two launch-risk fixes already landed locally:** webhook dedup now **fails closed** on
  outage (`19c00455f`) and billing production readiness was audited + hardened
  (`141fd5789`, verdict: **ready pending your dashboard verification**). Launch status was
  reconciled in `d0c559ce7`.
- **What is NOT proven** is dashboard configuration and one live money round-trip. That is
  what this checklist covers.
- **Deploy pointer (verify before launch):** local `v2-main` `HEAD` is `d0c559ce7`,
  **37 commits ahead** of the deployed `origin/v2-main` (`fd30e9cb5`). Pushing `v2-main`
  deploys to prod. Decide and record the exact commit you launch on.
- **Staging is intentionally deferred** (business decision). A full plan exists
  ([`staging-environment-plan.md`](./staging-environment-plan.md)). Launch proceeds
  production-first as a knowingly accepted risk.

---

## Owner dashboard checklist

### 1. Vercel (production config)

- [ ] **Production deploys from the intended branch/commit.** Prod is `v2-main` →
      `https://chainreact.app`. Confirm the deployment you launch on is the commit you
      reviewed (note its hash + date). Remember: local `v2-main` is 37 commits ahead of
      what is currently deployed — pushing deploys all of them.
- [ ] **`NEXT_PUBLIC_APP_URL = https://chainreact.app`** in the Production scope. This one
      var drives every OAuth redirect, every Stripe success/cancel/return URL, and the
      webhook URLs providers call back. A wrong value silently breaks OAuth and billing
      redirects.
- [ ] **Supabase keys set and all point at the SAME project** (`qcepijemjlkssfkvzlio`):
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`. A URL from one project + a key from another is a silent
      prod outage.
- [ ] **DB connection strings correct (if present in Vercel):**
      `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL` — all must target
      the same project ref as `NEXT_PUBLIC_SUPABASE_URL`. (These are used for migrations /
      direct SQL; app runtime uses the anon/service keys.)
- [ ] **Signing / encryption secrets present:**
      - `TOKEN_ENCRYPTION_KEY` (32 bytes base64 — encrypts OAuth tokens at rest; NOT the V1 key)
      - `OAUTH_STATE_SIGNING_KEY` (signs OAuth state)
      - `ANON_AI_LIMIT_SIGNING_KEY` (signs the anonymous-AI cap cookie; falls back to
        `OAUTH_STATE_SIGNING_KEY` if blank — so at least one of the two must be set, or
        anonymous AI planning fails closed)
      - `WATCH_CHANNEL_SECRET` (Google Calendar push-trigger HMAC)
      - `CRON_SECRET` (guards **every** cron route — if wrong/absent, all crons 401)
- [ ] **Hermes / React Agent env present** (React Agent is an expected launch feature — see
      §5): `HERMES_AGENT_ENABLED=true`, `CHAINREACT_AI_GATEWAY_URL`,
      `CHAINREACT_AI_GATEWAY_TOKEN` (optional: `HERMES_AGENT_TIMEOUT_MS`). If the flag is on
      but the gateway URL/token are missing, the rail shows unavailable.
      **REACT-AGENT-PRODUCTION-TIMEOUT-1:** prefer leaving `HERMES_AGENT_TIMEOUT_MS` UNSET so the
      code default (45s, clamped to 55s) applies. An explicit `30000` left over from the original
      default is what made complex builder turns fail with a 503 at the 30-second mark — an
      explicit value always wins over the fixed default.
- [ ] **Stripe platform billing vars present** (see §3 for the full gate):
      `STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`,
      `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and the six `STRIPE_PRICE_*` ids.
- [ ] **Provider env vars exist for the launch-certified providers** (Slack / Google /
      Microsoft / etc. `*_CLIENT_ID` / `*_CLIENT_SECRET` / signing secrets). The
      separate provider-validation chat owns which providers are certified — you only
      confirm their secrets are set in the Production scope.
- [ ] **`STRIPE_API_BASE` is UNSET in production.** It only exists to point e2e tests at a
      mock Stripe. If it is set in prod, real billing calls go to the wrong place.
- [ ] **Vercel Cron Jobs are enabled** for the project. Nine crons are declared in
      `vercel.json` (see §6); confirm the Vercel dashboard shows them enabled and recently
      firing.
- [ ] **Record the deployed production hash + date** for your launch evidence.

### 2. Supabase (production config)

- [ ] **One current production project ref** — `qcepijemjlkssfkvzlio` — and every Vercel
      env var above points at it. No dev/staging/V1 project (`xzwsdwllmrnrgbltibxt` is V1)
      is wired to the production app.
- [ ] **RLS/GRANT migration lint has passed in the repo** (it is green at the launch
      commit — this is a code gate, listed here so you know it's covered).
- [ ] **No pending unapplied migrations before launch.** Confirm the applied-migration list
      on `qcepijemjlkssfkvzlio` matches the repo. In particular these must be applied:
      - Durable run queue `20260713000000_workflow_runs_durable_queue.sql` (required for
        execution itself + queue-backlog monitoring)
      - Ops alerts `20260714000000_ops_signal_events.sql` +
        `20260714000001_ops_alert_events.sql`
      - Billing set: `account_billing` foundation + `plan_metadata` + `stripe_attachment`
        + `stripe_billing_events` + `ai_credits` + `internal_entitlement` +
        `lazy_task_period_rollover`
- [ ] **Email confirmation templates updated for cross-device confirmation.** The code path
      is live; the Supabase template + URL change is the missing half. Apply it and smoke a
      real "sign up on desktop, confirm on phone" flow. (This is a known launch gate.)
- [ ] **Auth → URL Configuration** has the production Site URL (`https://chainreact.app`)
      and Redirect URLs include the production auth callback (`.../auth/callback`) and OAuth
      callback origins.
- [ ] **Storage buckets required by file output exist** (workflow file-output / FileRef
      paths). Confirm the buckets the file-output contract expects are present in the prod
      project.
- [ ] **Service-role key is server-only** — never shipped to the browser. (Code enforces
      this; confirm no client env var accidentally carries it.)
- [ ] **No staging/dev Supabase project is accidentally connected to the production app.**

### 3. Stripe (platform billing — the payments gate)

This is the closeout's dashboard verification gate. All items are dashboard/env, not code.

- [ ] **`STRIPE_SECRET_KEY`** set (platform secret — ChainReact's own account, not a
      workflow-provider connected account).
- [ ] **`STRIPE_BILLING_WEBHOOK_SECRET`** set (the `whsec_…` for the
      `/api/webhooks/stripe-billing` endpoint — NOT the workflow provider's per-trigger
      secret).
- [ ] **All six `STRIPE_PRICE_*` ids** set: `STRIPE_PRICE_PRO_MONTHLY`,
      `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_PRICE_TEAM_ANNUAL`,
      `STRIPE_PRICE_BUSINESS_MONTHLY`, `STRIPE_PRICE_BUSINESS_ANNUAL`. (Annual has **no**
      legacy fallback; monthly may fall back to `STRIPE_PRICE_{PRO,TEAM,BUSINESS}`.)
- [ ] **Same Stripe mode for the key AND every price id** — all live, or all test for a
      rehearsal. A live secret + a test price id (or vice-versa) is rejected by Stripe at
      checkout, and **code cannot detect the mismatch** — you must confirm it in the
      dashboard.
- [ ] **Displayed pricing == actual Stripe Price amounts.** The `/pricing` page shows:
      - Free **$0**
      - Pro **$25/mo** or **$19/mo** annual
      - Team **$75/mo** or **$59/mo** annual
      - Business **$249/mo** or **$199/mo** annual
      - Enterprise **Custom**

      Open each configured Price id in Stripe and confirm the amount + interval match.
      Code cannot verify the dollar figure (it lives in Stripe).
- [ ] **Webhook endpoint** is `POST /api/webhooks/stripe-billing`, and its signing secret
      equals `STRIPE_BILLING_WEBHOOK_SECRET`.
- [ ] **Webhook subscribed to exactly the handled events:** `checkout.session.completed`,
      `customer.subscription.created`, `customer.subscription.updated`,
      `customer.subscription.deleted`. (Note the endpoint's API version; the code handles
      both pre-Basil and Basil `current_period_end` shapes.)
- [ ] **Customer Portal configured for payment-method update + cancel ONLY** — do **not**
      enable plan switching in the Portal. Plan changes must route through the in-app
      upgrade panels (they mint a fresh Checkout with correct metadata). A Portal-initiated
      plan switch would not re-sync `plan`/`tasks_limit` — a real bug if left enabled.
- [ ] **One controlled live checkout → webhook → portal round-trip** — run this **only when
      you explicitly approve** spending real money (or do it in test mode as a rehearsal).
      Confirms the whole chain end to end. (Overlaps the provider-validation chat's
      `LAUNCH-LIVE-QA-1` — coordinate so it's run once.)

### 4. Provider dashboards (owner-level only — NOT the provider test chat's work)

Do **not** re-run the separate chat's OAuth/action/trigger certification. Only confirm the
dashboard-side config an owner owns:

- [ ] **Production OAuth callback URLs allow-listed** for each launch-certified provider:
      `https://chainreact.app/api/integrations/oauth/<provider>/callback` (plus the Supabase
      auth callback). A missing entry makes that provider's connect flow 400 at the
      provider.
- [ ] **Production webhook URLs configured** where the provider needs them:
      `https://chainreact.app/api/webhooks/<provider>` (e.g. Dropbox, Facebook, Monday,
      Microsoft Graph, Slack, Shopify, GitHub, HubSpot, Mailchimp) and the Stripe billing
      endpoint above.
- [ ] **Provider app modes are correct** (development/test vs live/public/published) for
      what you intend to open. An app stuck in development mode only works for your own
      admins/testers.
- [ ] **Google / Microsoft verification + test-user limits understood.** Google sensitive
      scopes (Gmail, Analytics edit, etc.) require OAuth-app verification; an unverified app
      is capped to test users. Know which providers this gates before opening signups.
- [ ] **Signing secrets are production values** (Slack, Facebook/`X-Hub-Signature-256`,
      Monday, Dropbox, etc.) — not dev placeholders. Two providers (Mailchimp, Microsoft
      Graph) lack strong signature verification (accepted risk, §Accepted risks); ensure
      their shared/`clientState` secrets are high-entropy.
- [ ] **No staging/local callback URL is the ONLY configured production callback** — e.g. a
      leftover `localhost` or tunnel URL as the sole redirect will break prod OAuth.
- [ ] **Token-ingest providers' return URLs are production-correct** (e.g. Trello and any
      token-ingest provider — `app/integrations/token-ingest/<provider>`).

### 5. React Agent / Hermes

This is a **decided launch feature**, not an open product question.

- [ ] **React Agent is intended visible at MVP launch** (the builder left-rail).
- [ ] **Hermes is ON** — `HERMES_AGENT_ENABLED=true` + gateway URL/token set in the
      Production scope (see §1). The code default is OFF, which is only a safe default (like
      unset Stripe keys); turning it on is an env-config step.
- [ ] **The deterministic "Check workflow" checker is available** — it is local, zero-credit,
      no-LLM, and renders inside the rail. With the rail visible, it is visible.
- [ ] **Verify in production** that the rail is actually visible and that clicking
      "Check workflow" returns a review. If Hermes is off or the gateway vars are missing,
      the rail collapses to "unavailable" — treat that as a **launch config error to fix**,
      not an undecided decision.

### 6. Ops, cron, alerts, and logs

- [ ] **Owner alerts exist and have a delivery destination for all six categories:**
      stuck runs, queue backlog, high provider failure rate, OAuth refresh failures, billing
      webhook failures, cron failures. These are evaluated by
      `/api/cron/evaluate-ops-alerts` (every 5 min). They always write to the
      `ops_alert_events` ledger + structured logs (`event: "ops.alert.fired"`); for **push
      delivery** set **`OPS_ALERT_WEBHOOK_URL`** (a Slack or Discord incoming webhook).
      Recommended for launch so an alert reaches you, not just the DB.
- [ ] **Vercel crons are enabled and recently firing** — the nine in `vercel.json`:
      `poll-triggers` (1m), `run-scheduled-triggers` (1m), `process-run-queue` (1m),
      `renew-watch-subscriptions` (10m), `sweep-stale-runs` (10m),
      `release-expired-reservations` (10m), `evaluate-ops-alerts` (5m),
      `check-slack-health` (6h), `cleanup-workflow-files` (daily 04:00).
- [ ] **The ops-alert cron is active** — confirm `/api/cron/evaluate-ops-alerts` is
      deployed, scheduled, and its own heartbeat is fresh (it monitors itself).
- [ ] **A recent production smoke result is captured.** (Last recorded GREEN: `smoke:prod`
      2026-06-11, 30 tests, 29 passed / 1 skipped / 0 failed; post-deploy 2026-06-12 GREEN.
      Re-run against the launch commit and save the result — do not launch on a stale
      smoke.)
- [ ] **Skim Vercel production logs** for: 5xx bursts, auth errors, billing webhook
      failures, queue errors, and the `webhook_dedup_unavailable_skip_enqueue` marker (means
      the dedup store was unavailable and events were shed — by design, but you want to know
      it happened).
- [ ] **Runbooks exist for common incidents** — confirm you know where they are:
      [`ops-alerts.md`](../../runbooks/ops-alerts.md),
      [`v2-smoke-testing.md`](../../runbooks/v2-smoke-testing.md),
      [`stripe-accidental-action.md`](../../runbooks/stripe-accidental-action.md),
      [`hermes-agent-render-prod.md`](../../runbooks/hermes-agent-render-prod.md).

---

## Red-line no-go items

**Do NOT launch if any of these is true:**

- **Stripe live/test mode mismatch** — secret key and price ids are not all the same mode.
- **Missing Stripe billing webhook secret** (`STRIPE_BILLING_WEBHOOK_SECRET` unset → webhook
  fails closed, subscriptions never sync).
- **Price IDs do not match the public pricing** ($0 / $25·$19 / $75·$59 / $249·$199 / Custom).
- **Supabase email confirmation is broken** (cross-device confirm not smoked / template not
  applied) — kills first-run onboarding.
- **Hermes is expected but disabled or misconfigured** (rail shows "unavailable" in prod) —
  React Agent is a launch feature, so this is a config error, not a soft decision.
- **Cron jobs or ops alerts are not configured** (crons disabled, or no
  `OPS_ALERT_WEBHOOK_URL` destination and you have no other way to see alerts).
- **Production smoke is failing** against the launch commit.
- **The live-provider validation chat reports core provider failures** (OAuth
  connect/refresh/revoke or a core webhook/action path broken).
- **A Vercel env points at the wrong Supabase project** (URL/keys/DB strings not all
  `qcepijemjlkssfkvzlio`).
- **Unreviewed migrations are pending** on the prod DB before launch.

---

## Accepted risks

Knowingly launching production-first with these (documented, signed off — not open tasks):

- **No staging environment.** One Supabase project serves dev + prod, so migrations debut on
  prod. Plan exists and is intentionally deferred. Mitigation: verified prod DB backup +
  migration checklist before each apply.
- **Live-provider validation is owned by a separate chat.** This checklist assumes that
  chain reports green; it does not re-do it.
- **General Q4 within-session side-effect storage is deferred.** The narrower webhook dedup
  outage risk now **fails closed** (`19c00455f`) — an outage can no longer double-run a
  workflow; the trade is that webhook events arriving during a dedup-store outage are
  **dropped** (bounded to the outage window, loudly logged). The general backstop
  (`DEDUP-BACKSTOP-1`) is only load-bearing once auto-retry / resume-from-failed-node ships
  (both deferred).
- **Two providers lack cryptographic webhook signature verification** — Mailchimp (URL
  secrecy + audience id + dedup) and Microsoft Graph (`clientState` equality). MVP-tolerable
  if their secrets are high-entropy and never logged.
- **No `invoice.payment_failed` dunning** — failed renewals surface via the subsequent
  `subscription.updated → past_due` banner; explicit dunning is post-launch.
- **CI does not run the DB-gated RLS/isolation + Playwright e2e suites** (no test Supabase
  project yet). Can trail launch behind a manual pass.
- **Some items here cannot be verified from code** — they are dashboard truths only you can
  confirm.
- **Early launch should be owner-monitored** — watch logs + alerts closely for the first
  days.

---

## Evidence to capture before launch

Save these so you have a record of the exact launch state:

- [ ] **Vercel production deployment hash + date** you launched on.
- [ ] **Stripe webhook endpoint URL + subscribed event list** (screenshot) and its **API
      version**.
- [ ] **Stripe checkout Session ID** from the one controlled live/test round-trip (+ the
      resulting subscription id).
- [ ] **Supabase production project ref** (`qcepijemjlkssfkvzlio`) confirmed across all
      Vercel env vars (screenshot of the env group).
- [ ] **Production smoke result** (command output / pass count) against the launch commit.
- [ ] **Ops alert destination** — the `OPS_ALERT_WEBHOOK_URL` target (Slack/Discord channel)
      and one test alert delivered.
- [ ] **Selected production logs time window** you reviewed (start/end timestamps) and that
      it was clean of 5xx bursts / billing webhook failures / dedup-unavailable markers.

---

## Final launch-ready definition

Launch is ready when **all** of the following are true:

1. Vercel Production points at the reviewed `v2-main` commit; `NEXT_PUBLIC_APP_URL` =
   `https://chainreact.app`; all Supabase keys + DB strings point at
   `qcepijemjlkssfkvzlio`; all signing/encryption secrets + `CRON_SECRET` present;
   `STRIPE_API_BASE` unset.
2. Stripe: secret + webhook secret + six price ids set, **all same mode**, displayed prices
   match Stripe amounts, webhook on `/api/webhooks/stripe-billing` with the four events, and
   one checkout → webhook → portal round-trip succeeded (with your explicit approval).
3. Supabase: no pending migrations; cross-device email confirm applied + smoked; required
   storage buckets exist; service-role key server-only.
4. Providers: production OAuth callbacks + webhook URLs allow-listed, app modes correct,
   production signing secrets in place — and the provider-validation chat reports green.
5. React Agent / Hermes: `HERMES_AGENT_ENABLED=true` + gateway configured, rail visible in
   prod, "Check workflow" works.
6. Ops: nine crons enabled + firing; ops-alert cron active with a delivery destination for
   all six categories; production smoke GREEN against the launch commit; recent logs clean.
7. No [Red-line no-go item](#red-line-no-go-items) is present, and the
   [Accepted risks](#accepted-risks) are signed off.

---

## Files reviewed

- `docs/slices/phase-5/mvp-launch-status-reconciliation.md`
- `docs/slices/phase-5/mvp-launch-readiness-audit.md`
- `docs/slices/phase-5/billing-production-readiness-closeout.md`
- `docs/slices/phase-5/webhook-dedup-idempotency-closeout.md`
- `docs/slices/phase-5/staging-environment-plan.md`
- `docs/PROJECT_MEMORY.md`
- `CLAUDE.md`
- `docs/runbooks/ops-alerts.md` (+ runbook inventory under `docs/runbooks/`)
- `vercel.json`
- `.env.example`
- `services/ai-guidance/gateway/gatewayConfig.ts` (Hermes env var names)
- `services/observability/cronExpectations.ts` + `services/observability/opsAlertEvaluator.ts`
  (cron names + alert categories/destination)

## Commands run

Docs-only. Read-only verification only:

- `git rev-parse --show-toplevel` → confirmed `C:/Users/marcu/source/repos/ChainReactV2`.
- `git rev-parse --abbrev-ref HEAD` → `v2-main`.
- `git log --oneline -1` → `d0c559ce7 docs(launch): reconcile MVP launch status`.
- `git log --oneline -1 origin/v2-main` → `fd30e9cb5` (deployed).
- `git rev-list --count origin/v2-main..HEAD` → **37** local commits ahead.
- Confirmed the three referenced commits exist: `19c00455f` (webhook dedup fail-safe),
  `141fd5789` (billing hardening), `d0c559ce7` (launch status reconciliation).

**No** tests were run, **no** code was changed, **nothing** was pushed, deployed,
`db:push`-ed, or migrated. No env var or production change was made. Every dashboard item
above is an owner action that could not be, and was not, verified from code.
