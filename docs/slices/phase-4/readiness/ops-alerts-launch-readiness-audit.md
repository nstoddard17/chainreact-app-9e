# 4.OPS-ALERTS — Launch-Readiness Ops Alerts Audit + Activation Plan

**Type:** Planning / audit only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-07-01
**Branch:** `v2-main`

**Source of truth (verified current state — files opened for this audit):**
[opsAlertEvaluator.ts](../../../../services/observability/opsAlertEvaluator.ts) (cron-driven orchestrator; `buildDefaultDeps` wires all 6 readers) ·
[evaluateRules.ts](../../../../core/observability/evaluateRules.ts) (pure rules — emits candidates for all 6 categories) ·
[alertThresholds.ts](../../../../core/observability/alertThresholds.ts) (defaults + env overrides) ·
[opsHealthReaders.ts](../../../../repositories/opsHealthReaders.ts) (stuck-runs / provider-failure / oauth-refresh / queue-backlog readers) ·
[delivery.ts](../../../../services/observability/delivery.ts) (structured log always + optional `OPS_ALERT_WEBHOOK_URL`) ·
[cronExpectations.ts](../../../../services/observability/cronExpectations.ts) (9 monitored crons + cadences) ·
[signalRecorders.ts](../../../../services/observability/signalRecorders.ts) (`withCronHeartbeat` + `recordBillingWebhookFailure`) ·
[evaluate-ops-alerts/route.ts](../../../../app/api/cron/evaluate-ops-alerts/route.ts) (thin auth+dispatch, self-monitoring) ·
[stripe-billing/route.ts](../../../../app/api/webhooks/stripe-billing/route.ts) (records failures) ·
[refreshAndRetry.ts](../../../../services/oauth/refreshAndRetry.ts) (marks `needs_reconnect_at`) ·
[vercel.json](../../../../vercel.json) (9 cron schedules incl. `evaluate-ops-alerts` every 5m) ·
migrations [20260714000000_ops_signal_events.sql](../../../../supabase/migrations/20260714000000_ops_signal_events.sql) · [20260714000001_ops_alert_events.sql](../../../../supabase/migrations/20260714000001_ops_alert_events.sql) · [20260713000000_workflow_runs_durable_queue.sql](../../../../supabase/migrations/20260713000000_workflow_runs_durable_queue.sql) ·
existing design + runbook: [phase-8/launch-alerts-audit-plan.md](../../phase-8/launch-alerts-audit-plan.md) · [runbooks/ops-alerts.md](../../../runbooks/ops-alerts.md)

---

## 1. Context

This slice was requested as "audit and plan the production monitoring/alerting slice
needed before launch," covering six alert areas: stuck runs, queue backlog, high
provider failure rate, OAuth refresh failures, billing webhook failures, cron
failures.

**Headline finding of the audit: the alerting system already exists.** It shipped as
**Phase 8b** (`launch-alerts-audit-plan.md`, slices A–F, implemented locally with a
committed runbook). All six required categories are wired end to end — signal source,
aggregation reader, pure threshold rule, dedupe/cooldown, delivery, and retention —
and are covered by 54 passing unit tests. The evaluator cron is already in
`vercel.json` at every 5 minutes.

So this document is **not** a from-scratch design. It is (a) a verified reconciliation
of the six requested areas against the shipped system, and (b) the honest
**launch-readiness delta**: the operational activation steps and the small residual
gaps that stand between "code committed locally" and "alerting actually firing in
production." Per the planning-doc rules, every current-state claim below traces to a
file listed in the Source-of-truth block; every recommendation is labeled as such.

---

## 2. Current codebase findings (verified)

### 2.1 Architecture as built

One cron-driven evaluator, pure-core rules, service-role DB readers, two system
tables, log + optional-webhook delivery. Exactly the shape the phase-8 plan proposed:

```
app/api/cron/evaluate-ops-alerts/route.ts   (59 lines: requireCronAuth → evaluateOpsAlerts(buildDefaultDeps) → serialize; wrapped in withCronHeartbeat so a dead evaluator self-reports)
  └─ services/observability/opsAlertEvaluator.ts   (buildSnapshot → evaluateOpsAlertRules → planAlertReconciliation → fire/deliver/suppress/resolve → retention)
       ├─ repositories/opsHealthReaders.ts          (stuck runs, provider failures, oauth-refresh rollup, queue depth)
       ├─ repositories/opsSignalEvents.ts           (cron heartbeats + billing-webhook failure counts)
       ├─ core/observability/evaluateRules.ts       (PURE: snapshot → candidate alerts, all 6 categories)
       ├─ core/observability/alertThresholds.ts     (defaults, env-overridable)
       ├─ core/observability/dedupe.ts              (fire | deliver | suppress | resolve reconciliation)
       ├─ repositories/opsAlertEvents.ts            (durable ledger + single-open-row-per-key claim)
       └─ services/observability/delivery.ts        (structured log ALWAYS + optional OPS_ALERT_WEBHOOK_URL)
```

Signal producers (write side): every cron route is wrapped by `withCronHeartbeat`
(records `ops_signal_events` on each authorized tick, ok/failed); the Stripe billing
webhook route calls `recordBillingWebhookFailure` on signature / bad-request /
processing failures.

### 2.2 Reader failure isolation + honest degradation (verified)

`opsAlertEvaluator.buildSnapshot` runs each reader in a `safe()` wrapper: a throwing
reader contributes a safe fallback + a `readerErrors` entry + an
`ops.alert.reader_failed` log, so one failing signal never aborts the tick or fires a
false alert. Queue backlog specifically falls back to `monitored:false` (reported as
`unmonitored:read_failed`), never a green `depth:0` — so an unapplied durable-queue
migration reads as "unmonitored," not "healthy."

### 2.3 No-leak posture (verified)

Both tables are `system-table` / RLS deny-all / service-role-only. Alert `context`
carries counts, thresholds, provider keys, and cron names only. `evaluateRules.ts`
and `delivery.ts` never place tokens, payloads, messages, scopes, Stripe raw events,
or error strings into an alert body or log. A dedicated no-leak test guards this
(phase-8 plan §6).

### 2.4 Delivery channels that exist today

1. **Structured log — always on, no config.** `event: "ops.alert.fired"` per alert +
   `event: "ops.alert.evaluated"` per tick (Vercel logs).
2. **Durable ledger — always on.** `ops_alert_events` (one open row per condition).
3. **Optional outbound webhook — env-gated.** `OPS_ALERT_WEBHOOK_URL`; POSTs
   `{ text, content }` (Slack or Discord incoming webhook), 5s timeout, never throws.

**No third-party monitor (Sentry/Datadog/etc.) exists or is proposed** — confirmed,
and explicitly out of scope per the hard rules.

---

## 3. Coverage reconciliation — the six requested areas

Every requested area is **already covered**. The table below is the per-alert
breakdown the task asked for, filled from the real code (rule fn + reader + threshold
const). "Impl location" is the file that owns each piece.

| # | Area | Signal source (table/event) | Threshold (default) | Freq / debounce | Severity | Owner-facing message | False-positive risk | Impl location |
|---|---|---|---|---|---|---|---|---|
| 1 | **Stuck runs** | `workflow_runs` where `status='running' AND finished_at IS NULL AND started_at < cutoff` | ≥ **3** stuck; warn at **15m**, critical at **30m** old | eval 5m · cooldown 60m | warning→critical | "Inspect execution engine health; stale-run sweep finalizes at 60m but a rising count signals stuck dispatch." | Low. Warn window (15m) is well below the 60m stale-run reaper, so normal long runs don't trip it; min-count 3 avoids single-run noise. | rule `stuckRunCandidates` (evaluateRules) · `readStuckRuns` (opsHealthReaders) |
| 2 | **Queue backlog** | `workflow_runs` where `status='queued'` (depth + oldest `created_at` age) | depth > **100** OR oldest > **10m** | eval 5m · cooldown 60m | warning→critical (both breach) | "Check the run-queue processor cron + inline drain; backlog is growing faster than it drains." | Low. Read failure → `unmonitored:read_failed` (never green). Depth 100 is generous vs the 1/min drain cron. | rule `queueBacklogCandidates` · `readQueueBacklog` |
| 3 | **Provider failure rate** | `workflow_runs.steps[]` (`{nodeId,status}`) mapped nodeId→provider via workflow `draft_definition` | window **15m**, floor **≥ 20** attempts, rate > **50%** | eval 5m · cooldown 60m · per-provider dedupe key | warning→critical (≥80%) | "Provider \"X\" is failing a high share of steps — check provider status / scopes / rate limits." | Medium. Volume floor (20) suppresses low-N noise; provider attribution is an approximation across workflow edits (documented in the reader). | rule `providerFailureCandidates` · `aggregateProviderActionFailures` |
| 4 | **OAuth refresh failures** | `integrations.needs_reconnect_at >= cutoff`, grouped by provider | window **60m**, **≥ 5** distinct integrations for one provider | eval 5m · cooldown 60m · per-provider dedupe key | warning | "Multiple \"X\" connections need reconnect — likely a provider-wide token/scope issue. Review /apps and provider OAuth status." | Low. The ≥5-distinct-integrations floor distinguishes a provider-wide outage from a single user reconnect. | rule `oauthRefreshCandidates` · `readOAuthRefreshFailuresByProvider` |
| 5 | **Billing webhook failures** | `ops_signal_events` where `kind='billing_webhook_failure'` (`detail_code` = invalid_signature / bad_request / processing_error) | ≥ **3** processing fails / **60m**; ≥ **5** signature fails / **10m** → critical | eval 5m · cooldown 60m · split dedupe keys (signature vs processing) | processing=warning, signature=critical | "Stripe billing webhook … verify STRIPE_BILLING_WEBHOOK_SECRET / endpoint config" / "processing is failing — plan/status sync may be stale." | Low. Signature burst = misconfig/spoof (critical); processing count = real handler failures. | rule `billingWebhookCandidates` · `countBillingWebhookFailures` (opsSignalEvents) · recorded in stripe-billing route |
| 6 | **Cron failures** | `ops_signal_events` where `kind='cron_run'` (per-source last outcome, consecutive fails, last-success age) vs `MONITORED_CRONS` cadence | explicit `failed` OR **≥ 3** consecutive OR last-success age > interval × **3** | eval 5m · cooldown 60m · per-cron dedupe key | warning→critical (failing AND missing) | "Cron \"X\" is failing or hasn't succeeded on schedule — check the cron logs and CRON_SECRET / route health." | Low. Missing-run multiplier ×3 tolerates a skipped tick; every cron writes a heartbeat via `withCronHeartbeat`. | rule `cronFailureCandidates` · `getCronRunStatuses` (opsSignalEvents) · `cronExpectations.ts` |

**Monitored crons (9)** — `cronExpectations.ts`: poll-triggers (1m), run-scheduled-triggers (1m),
process-run-queue (1m), renew-watch-subscriptions (10m), sweep-stale-runs (10m),
release-expired-reservations (10m), check-slack-health (6h), cleanup-workflow-files (24h),
evaluate-ops-alerts (5m, self-monitoring). All nine appear in `vercel.json`.

---

## 4. The real launch-readiness delta (gaps that remain)

The code is done. What is NOT done is **operational activation** plus a few
explicitly-deferred follow-ups. These are the only launch-relevant gaps.

### G1 — Production migrations not confirmed applied (BLOCKER, operational)
`ops_signal_events`, `ops_alert_events`, and the durable-queue migration
(`20260713000000`) exist in `supabase/migrations/` but applying them is `db:push`-gated
and out of scope here. Until the durable-queue migration is applied, queue backlog (#2)
reads `unmonitored:read_failed` (honest, but not monitoring). **Owner action:** apply
the three migrations to the production DB. *Unverified from this repo whether they are
already applied to prod — needs a DB check.*

### G2 — Deploy needed to activate the evaluator cron (BLOCKER, operational)
The every-5-min `evaluate-ops-alerts` schedule lives in `vercel.json` but only runs
once deployed. Deploy is push-gated. **Owner action:** deploy after G1.

### G3 — No active push channel configured (HIGH, config)
`OPS_ALERT_WEBHOOK_URL` is **not present** in `.env.example` or `.env.local` (verified
by name-only grep). With it unset, alerts land only in `ops_alert_events` + Vercel logs
— nothing pages a human. For launch, "alerts exist in the DB" is not the same as
"someone finds out." **Recommendation:** set `OPS_ALERT_WEBHOOK_URL` to a dedicated
Slack/Discord ops channel incoming webhook. This is already wired (delivery.ts) and adds
no vendor. This is the single highest-value launch step after G1/G2.

### G4 — No end-to-end verification harness (MEDIUM, code — the one real remaining code gap)
Coverage today: 54 unit tests across core/services/repositories + a route unit test
(`tests/unit/app/api/cron/evaluate-ops-alerts.route.test.ts`). There is **no
integration/e2e test** that seeds a genuinely breaching signal against a real test
schema and asserts the full fire → deliver → dedupe (cooldown) → resolve loop end to
end (the pattern the trigger-smoke lane uses for webhooks). This is the natural next
coding slice (§9).

### G5 — Acknowledged follow-ups, correctly out of scope for launch-minimum
- **Billing reconciliation drift** (roadmap wording) is broader than webhook failures:
  it would reconcile `task_billing_events` / reservations vs Stripe. Deferred by the
  phase-8 plan §8; #5 covers webhook failures only. *Recommendation: keep deferred; it
  is a correctness-audit reader, not a launch blocker.*
- **Generic per-provider proactive OAuth health / token-refresh cron.** #4 is reactive
  (fires off `needs_reconnect_at`, which is set on a 401 during a run/option load); only
  Slack has a proactive `check-slack-health` cron. *Recommendation: acceptable for
  launch; a token-refresh cron is a separate Phase-8 item.*
- **No admin/ops dashboard.** By design. Alerts are queryable in `ops_alert_events` +
  logs + optional webhook. A read-only ops view is a later slice.

---

## 5. Product / model decision

This is **internal / owner launch-readiness alerting**, deliberately NOT customer-facing
notification preferences. It does not touch the account-scoped `notifications` table
(RLS `auth.uid()=user_id`, customer-facing type enum). The ops tables are system-tables
(no account scope, service-role only). No credential-sharing surface is involved. This
separation is already enforced in code and must be preserved: never route ops alerts
through the end-user notification path, and never route user notifications through the
ops path.

---

## 6. Recommended approach

**Do not redesign.** The shipped architecture is correct and matches the phase-8 plan.
The launch-readiness work is:

1. **Activate** (operational, owner-gated): apply the three migrations (G1), deploy
   (G2), configure `OPS_ALERT_WEBHOOK_URL` (G3).
2. **Verify** (code, launch-safe): add the end-to-end verification harness (G4) so the
   fire→deliver→dedupe→resolve loop is proven against a real schema before relying on it
   in production.
3. **Tune later, not now**: the conservative default thresholds (§7) are env-overridable
   with zero code change; tune from real launch traffic rather than guessing pre-launch.

Delivery channel decision (task item 4): **use the existing optional webhook.** A
delivery channel already exists (structured logs, always). For an *active* channel, the
smallest launch-safe path is the already-wired `OPS_ALERT_WEBHOOK_URL` (Slack/Discord
incoming webhook) — no new vendor, no new code, no paid service. Email is declared but
unbuilt for ops and is not needed for launch.

---

## 7. Thresholds (shipped defaults, all env-overridable)

From `alertThresholds.ts` (`DEFAULT_OPS_ALERT_THRESHOLDS`); each key has an
`OPS_ALERT_*` env override, read once per tick, invalid/≤0 falls through to default.

| Category | Default | Env keys |
|---|---|---|
| Stuck runs | ≥3 count; warn 15m / crit 30m | `OPS_ALERT_STUCK_RUN_MIN_COUNT` / `_WARN_MIN` / `_CRIT_MIN` |
| Queue backlog | depth 100 / oldest 10m | `OPS_ALERT_QUEUE_DEPTH_MAX` / `_QUEUE_OLDEST_AGE_MIN` |
| Provider failure | window 15m / floor 20 / 50% | `OPS_ALERT_PROVIDER_FAIL_WINDOW_MIN` / `_MIN_VOLUME` / `_RATE_PCT` |
| OAuth refresh | window 60m / ≥5 | `OPS_ALERT_OAUTH_FAIL_WINDOW_MIN` / `_MIN_COUNT` |
| Billing webhook | 3/60m; sig 5/10m | `OPS_ALERT_BILLING_WH_FAIL_COUNT` / `_FAIL_WINDOW_MIN` / `_SIG_BURST` / `_SIG_WINDOW_MIN` |
| Cron | consec 3 / missing ×3 | `OPS_ALERT_CRON_CONSEC_FAIL` / `_CRON_MISSING_MULTIPLIER` |
| Cooldown (all) | 60m | `OPS_ALERT_COOLDOWN_MIN` |
| Retention | signals 30d / alerts 90d | `OPS_SIGNAL_RETENTION_DAYS` / `OPS_ALERT_RETENTION_DAYS` |

---

## 8. Tests required / current state

Current (verified passing this slice — 54 tests / 8 suites):
- `tests/unit/core/observability/` — `evaluateRules` (all 6 categories, good/bad), `alertThresholds` (env parse), `dedupe` (fire/suppress/resolve, single-open claim).
- `tests/unit/services/observability/` — `opsAlertEvaluator` (reader isolation, reconciliation), `delivery` (log always, webhook fail isolated, no-leak), `signalRecorders` (heartbeat + billing failure).
- `tests/unit/repositories/` — `opsHealthReaders`, `opsSignalEvents`.
- `tests/unit/app/api/cron/evaluate-ops-alerts.route.test.ts` — route auth + dispatch.

Gap (the implementation slice must add):
- **End-to-end integration test on a real test schema**: seed a breaching signal per
  category (e.g. insert N `ops_signal_events` cron_run `failed` rows; insert a stuck
  `workflow_runs` row), run `evaluateOpsAlerts(buildDefaultDeps(now))`, assert exactly
  one `ops_alert_events` open row per category, a re-tick within cooldown suppresses
  (occurrence bumps, no new row), clearing the condition resolves the row, and the
  fired-alert log / webhook body contains no seeded secret string. Mirror the
  trigger-smoke direct-seed + cleanup discipline (0 leaked rows).

---

## 9. Implementation slice breakdown

Ordered; all local-only, no push/db:push/deploy without explicit approval.

- **CS-1 (operational, owner) — Activate.** Apply migrations `20260713000000` +
  `20260714000000` + `20260714000001` (`db:push`), set `OPS_ALERT_WEBHOOK_URL`, deploy.
  Gated on Marcus; not a code slice. *This is the actual launch blocker.*
- **CS-2 (code, launch-safe) — End-to-end verification harness (G4).** A gated
  integration test (`tests/integration/observability/ops-alerts.evaluator.dev.test.ts`)
  that direct-seeds each breaching signal, runs the real evaluator against a real test
  schema, and asserts fire → deliver → dedupe → resolve + no-leak + 0 leaked rows. No
  product code change. Optional `smoke:ops-alerts` script. This is the recommended next
  coding slice.
- **CS-3 (later, deferred) — Billing reconciliation drift reader (G5).** A parity-style
  reader over `task_billing_events` / reservations, new rule + threshold. Separate
  follow-up; not launch-minimum.
- **CS-4 (later, deferred) — Proactive per-provider OAuth health (G5).** A token-refresh
  cron feeding a proactive `needs_reconnect` signal beyond Slack. Separate Phase-8 item.

Nothing here ships behind a new feature flag: ops alerting is required launch
infrastructure (no "finished but disabled") per the phase-8 decision; the only gates are
the operational `db:push`/deploy and the optional `OPS_ALERT_WEBHOOK_URL`.

---

## 10. Risks / open questions

- **O-1 — Are the three migrations already applied to prod?** Unverified from the repo.
  *Recommendation: confirm before launch; if not applied, queue backlog is unmonitored
  and cron/billing signal tables don't exist.*
- **O-2 — Is anyone watching Vercel logs pre-webhook?** If `OPS_ALERT_WEBHOOK_URL`
  stays unset at launch, alerts are silent-until-queried. *Recommendation: treat G3 as a
  launch requirement, not optional.*
- **O-3 — Provider-failure attribution approximation.** `aggregateProviderActionFailures`
  maps nodeId→provider from the *current* workflow definition; a workflow edited between
  a run and the evaluation could mis-attribute. Low impact (rate alert, not billing).
  *Recommendation: accept for launch; documented in the reader.*
- **O-4 — Cooldown vs. incident fatigue.** 60m re-delivery may be too quiet for a
  critical during an active incident. *Recommendation: launch at 60m; tune
  `OPS_ALERT_COOLDOWN_MIN` down for critical-only if needed (env, no code).*

---

## 11. Acceptance criteria

For **this planning slice**: doc exists under `docs/slices/phase-4/readiness/`, every
current-state claim cites a file that was opened, the six areas are reconciled against
the shipped system, the real delta (G1–G5) is separated from the built system, no source
/ migration / test / behavior changed, nothing pushed. ✅

For the **implementation slice (CS-2)** later: a gated e2e test proves fire → deliver →
dedupe → resolve for all six categories against a real schema, asserts no-leak, cleans up
to 0 leaked rows, and passes alongside the existing 54 unit tests.

---

## 12. Hard boundaries (what this slice did NOT change)

No source, no migrations, no tests, no UI, no thresholds, no `vercel.json`, no env. No
`db:push`, no deploy, no push. This slice only reads code + writes this doc. The shipped
Phase 8b ops-alerting system is unchanged.

---

## 13. Recommended next step

**CS-1 (owner/operational):** apply the three migrations, set `OPS_ALERT_WEBHOOK_URL` to
an ops Slack/Discord webhook, and deploy — this is the true launch blocker and needs
Marcus (db:push + deploy gated). **CS-2 (next code slice I can do):** author the gated
end-to-end ops-alerts verification harness (§8 gap / §9 CS-2), mirroring the
trigger-smoke direct-seed pattern, so the fire→deliver→dedupe→resolve loop is proven
against a real schema before launch relies on it.
