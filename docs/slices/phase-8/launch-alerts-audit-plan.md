# Launch Alerts — Audit + Implementation Plan (Phase 8b)

> **Status (updated):** Slices A–F IMPLEMENTED locally (commits OPS-ALERTS-AB / C /
> D / E + this closeout; not pushed). Runbook: [`../../runbooks/ops-alerts.md`](../../runbooks/ops-alerts.md).
> All six categories are live except queue backlog (B), which is the real
> queued-depth alert gated behind `QUEUE_BACKLOG_MONITORING_ENABLED` until the
> durable-queue migration is applied (reported `unmonitored`, never green). Ops
> steps for Marcus: apply the two ops migrations (`db:push`), optionally set
> `OPS_ALERT_WEBHOOK_URL`, deploy (adds the every-5-min cron). This doc is the source of
> truth for the pre-launch internal/owner alerting work and maps directly to
> roadmap [Phase 8b — Alerting](../../roadmap/chainreact-v2-roadmap.md#phase-8--ops-docs-testing-launch-readiness):
> _"Pages on: cron job failures, queue depth growing, OAuth refresh failure rate
> spike per provider, billing reconciliation drift, dedup outage, error rate spike
> per workflow."_
>
> **Scope:** internal/owner launch-readiness alerts, NOT customer-facing
> notification preferences.
>
> **Hard rules honored:** no third-party monitoring dependency (prefer existing
> logs / DB / cron / services); no fake UI / fake health / placeholder always-OK
> alerts; V2 boundaries (thin routes → services → repositories → DB; core pure; no
> client imports of server code); DB security (RLS, service-role only via the
> approved helper, no secrets/tokens/payloads in logs or alert bodies); no push /
> deploy / db:push / launch-posture change.

## 0. Critical context discovered during the audit

A **durable run-queue is currently in-flight as uncommitted working-tree WIP**
(Slice 6.DURABLE-QUEUE-1). Do **not** disturb these paths:

- `services/execution/runQueueProcessor.ts` (new, untracked)
- `app/api/cron/process-run-queue/route.ts` + `constants.ts` (new, untracked)
- `supabase/migrations/20260713000000_workflow_runs_durable_queue.sql` (untracked,
  **enum value `'queued'` NOT YET APPLIED** to the DB)
- Modified: `services/execution/enqueue.ts`, `services/execution/engine.ts`,
  `services/triggers/dispatch.ts`, `repositories/workflowRuns*.ts`, `vercel.json`

This is the single biggest input to the **queue backlog** category (§1.B) — that
alert is properly built against the durable queue and is therefore **sequenced
after** the queue WIP lands, with an honest interim fallback that works today.

---

## 1. Current state — per alert category

Legend for §2 gap classes: **covered** · **partial** · **missing-signal** ·
**missing-delivery** · **missing-tests** · **blocked-by-future-infra**.

### A. Stuck workflow runs

- **Signal exists.** `workflow_runs` (`supabase/migrations/20260507000001_workflow_runs.sql`,
  pre-run lifecycle `20260525000004_workflow_runs_pre_run_lifecycle.sql`) carries
  `status` (`running` | `succeeded` | `failed`), `started_at`, `finished_at`
  (NULL while running). A stuck run = `status='running' AND finished_at IS NULL AND
  started_at < cutoff`.
- **Partial handling already.** `app/api/cron/sweep-stale-runs/route.ts` →
  `services/execution/staleWorkflowRunSweep.ts` marks such rows `failed` after **60
  min** (crash recovery), every 10 min. Index `workflow_runs_failed_idx` exists.
- **Gap:** the sweep is *remediation*, not *alerting* — no owner is told that runs
  are getting stuck at a rate that matters. No reader aggregates stuck-run counts.

### B. Queue backlog

- **Today (committed code):** execution is **in-process fire-and-forget** via
  `services/execution/enqueue.ts` (`runWorkflowInBackground` + `after()`/`waitUntil`).
  There is **no durable, introspectable queue** in committed code — backlog is not
  measurable beyond "stuck `running` rows" (which overlaps with §1.A).
- **In-flight (WIP, §0):** durable queue makes backlog first-class —
  `workflow_runs.status='queued'`, index `workflow_runs_queued_idx (status,
  created_at)`, drained by `process-run-queue` cron + inline. Once landed, backlog
  is `COUNT(*) WHERE status='queued'` and oldest-queued age = `now - MIN(created_at)`.
- **Honest limitation:** the durable queue is **not committed and the `'queued'`
  enum is not applied**. A real backlog metric does not exist until that ships.

### C. High provider failure rate

- **Signal exists but unaggregated.** Per-step failures live on
  `workflow_runs.steps` (jsonb array of `{nodeId, status, output?, error:{code,
  message, details?}}`) plus run-level `fatal_error` and `error_classification`
  (`repositories/workflowRuns.ts`). Error codes are classified by
  `core/errors/humanizeActionError.ts` (engine codes + provider codes like Slack
  `channel_not_found`, `invalid_auth`, `http_<status>`).
- **Gap:** **no aggregation by provider/action/status/error-class**. The only
  aggregate surface is `workflow_run_stats` view (`repositories/workflowRunStats.ts`)
  — per-*workflow* success rate, not per-provider. No reader rolls failures up.

### D. OAuth refresh failures

- **Signal exists (per-integration, safe).** `integrations.needs_reconnect_at`
  (`supabase/migrations/20260624000000_add_integration_needs_reconnect_at.sql`) is
  set by `services/oauth/dispatcher.ts` (`markNeedsReconnect` on
  `RefreshAuthRequiredError`) and cleared on successful refresh/reconnect. It is a
  **timestamp only** — no raw provider error/scope stored (good for no-leak).
- **Partial proactive check (Slack only).** `services/integrations/slackHealthCheck.ts`
  via `app/api/cron/check-slack-health/route.ts` (every 6h) probes `auth.test`.
- **Gap:** refresh is otherwise **reactive** (discovered on 401 during a run/option
  load); there is **no token-refresh cron** and **no aggregation** of
  refresh-failure volume by provider to distinguish a single user reconnect from a
  provider-wide outage.

### E. Billing webhook failures

- **Success is persisted; failure is NOT.** `app/api/webhooks/stripe-billing/route.ts`
  → `services/billing/stripeBillingWebhook.ts` returns a discriminated union
  (`processed`/`deduped`/`ignored` → 200; `not_configured`/`invalid_signature`/
  `bad_request` → 400/500). Only **success** is recorded — `stripe_billing_events`
  (`supabase/migrations/20260613000000_stripe_billing_events.sql`, service-role
  only, `event_id` PK, safe identifiers only, no card/email/amount).
- **Gap (missing signal):** signature failures, bad-request, and unhandled-throw
  500s are **only logged + returned to Stripe** (which retries ~3 days). There is
  **no durable record** of webhook processing failures, so an evaluator cannot see
  them. "Billing reconciliation drift" (roadmap wording) is likewise not measured.

### F. Cron failures

- **No cron run history exists.** Cron routes authenticate via
  `services/cron/auth.ts` (`requireCronAuth`, Bearer `CRON_SECRET`, timing-safe) and
  log `cron.<name>.done` / `cron.<name>.fatal` as structured JSON to
  `console.info/error`. **Logs are not queryable from the DB.** There is **no table
  recording last-run / last-success / outcome per cron.**
- **Gap (missing signal):** explicit failures are invisible to an in-DB evaluator,
  and **missing expected runs cannot be detected at all** without a heartbeat.
  `vercel.json` wires 7 crons (`poll-triggers`, `run-scheduled-triggers` every min;
  `renew-watch-subscriptions`, `sweep-stale-runs`, `release-expired-reservations`
  every 10 min; `check-slack-health` 6h; `cleanup-workflow-files` daily).

### Shared infrastructure state

- **Notifications are customer-facing + per-user only.** `services/notifications/*`,
  `repositories/notifications.ts` (table `notifications`, RLS `auth.uid()=user_id`).
  Orchestrators (`notifyWorkflowFailure.ts`, `notifyHighRiskWorkflowEvent.ts`,
  `reconnectNotification.ts`) all target the workflow **creator's** `user_id`.
  Channel registry implements **in-app only** (email/Slack/Discord/SMS declared,
  not built). **There is no owner/internal/ops alert path.**
- **No metrics sink / external monitor** (no Sentry/Datadog/etc.). Confirmed.
- **No admin/ops dashboard.** `core/admin/` is `.gitkeep`; no `app/(app)/admin/`.
  Read-only internal diagnostics exist (`app/api/internal/diagnostics/*`) but are
  per-resource debugging, not a status surface.
- **Audit-ledger precedent to mirror** (system-table, no-leak, anonymize→purge):
  `react_agent_audit_events`, `mcp_request_audit`, `mcp_rate_limits`.

---

## 2. Gap classification

| Category | Signal | Aggregation | Delivery | Tests | Class |
|---|---|---|---|---|---|
| A. Stuck runs | ✅ exists (`workflow_runs`) | ❌ none | ❌ owner | ❌ | **partial** (signal yes, alert no) |
| B. Queue backlog | ⚠️ only via WIP durable queue | ❌ | ❌ | ❌ | **blocked-by-future-infra** (interim possible) |
| C. Provider failure rate | ✅ exists (`steps[].error`) | ❌ none | ❌ | ❌ | **partial** (needs aggregation reader) |
| D. OAuth refresh failures | ✅ exists (`needs_reconnect_at`) | ❌ none | ❌ | ❌ | **partial** (needs provider rollup) |
| E. Billing webhook failures | ❌ failures not persisted | ❌ | ❌ | ❌ | **missing-signal** |
| F. Cron failures | ❌ no run history table | ❌ | ❌ | ❌ | **missing-signal** (explicit + missing-run) |
| (all) | — | — | ❌ no owner path | ❌ | **missing-delivery** + **missing-tests** |

---

## 3. Recommended V2-native architecture (smallest real thing that works pre-launch)

A single cron-driven **evaluator** reads existing tables + two small new signal
surfaces, applies pure threshold rules, dedupes/cooldowns against a durable alert
table, and delivers to the owner via structured logs (always) plus an optional
env-configured webhook. No external monitor, no dashboard in this slice.

```
app/api/cron/evaluate-ops-alerts/route.ts        ← thin: auth + dispatch + serialize
   └─ services/observability/opsAlertEvaluator.ts ← orchestrates the run
        ├─ repositories/ readers (DB only):
        │    • workflowRuns: stuck-run count, failed-step aggregation by provider/code
        │    • integrations: needs_reconnect rollup by provider
        │    • opsSignalEvents: cron heartbeats + billing-webhook failures
        │    • (post-WIP) workflowRuns: queued depth + oldest-queued age
        ├─ core/observability/ (PURE, imports only contracts):
        │    • alertThresholds.ts  (constants, env-overridable)
        │    • evaluateRules.ts    (signals snapshot → candidate alerts)
        │    • dedupe.ts           (candidate + last event → fire | suppress | escalate)
        ├─ repositories/opsAlertEvents.ts   ← claim/record dedupe+cooldown state
        └─ services/observability/delivery.ts ← log (always) + optional owner webhook
```

Signal producers (write-side, thin, reuse existing seams):

```
each app/api/cron/* route ─→ services/observability/recordCronRun.ts ─→ repositories/opsSignalEvents.ts
services/billing/stripeBillingWebhook.ts (failure branch) ─→ recordBillingWebhookFailure ─→ opsSignalEvents
```

Why this shape:
- **contracts/opsAlert.ts** — typed `OpsAlertEvent` + `OpsAlertCategory` /
  `OpsAlertSeverity` Zod schemas. One contract consumed by core + services + repos.
- **core/observability/** is pure (threshold + dedupe decisions are unit-testable
  with no DB), satisfying the `core` purity boundary.
- **repositories/** do only DB access (readers + the two new system tables).
- **services/observability/** orchestrates; the cron route stays < 50 lines.
- Delivery reuses the **structured-log standard** (roadmap 8a, `event` field) as the
  guaranteed channel; the optional owner webhook is the only outbound and is
  env-gated. **No env set → durable table row + log still fire** (real record, never
  a fake "OK").
- Mirrors the existing audit-ledger + cron-route patterns already in the repo.

**Dedupe / cooldown:** an alert is keyed by `dedupe_key = category + scope`
(e.g. `provider_failure_rate:slack`, `cron_failure:poll-triggers`). On each tick the
evaluator looks up the open `ops_alert_events` row for that key:
- no open row → **fire** (insert `open`, deliver).
- open row within cooldown window → **suppress delivery**, bump `occurrence_count` +
  `last_seen_at` (no spam).
- open row past cooldown OR severity escalated → **re-deliver** (escalation).
- condition no longer breaches → mark `resolved` (optional recovery note).

---

## 4. Thresholds (conservative defaults, configurable)

All live in `core/observability/alertThresholds.ts` as constants, each overridable
via env (read once at evaluator start, validated, fall through to default on
invalid). Starting values, deliberately conservative to avoid launch-day noise:

| Category | Threshold | Const / env |
|---|---|---|
| Stuck runs | `running` & `started_at` older than **15 min** (warn) / **30 min** (critical); alert when **≥ 3** such runs | `STUCK_RUN_WARN_MIN=15`, `STUCK_RUN_CRIT_MIN=30`, `STUCK_RUN_MIN_COUNT=3` |
| Queue backlog *(post-WIP)* | depth **> 100** queued **OR** oldest-queued age **> 10 min** | `QUEUE_DEPTH_MAX=100`, `QUEUE_OLDEST_AGE_MIN=10` |
| Provider failure rate | window **15 min**, min volume **≥ 20** attempts, failure rate **> 50%** for a provider (volume floor prevents low-N noise) | `PROVIDER_FAIL_WINDOW_MIN=15`, `PROVIDER_FAIL_MIN_VOLUME=20`, `PROVIDER_FAIL_RATE_PCT=50` |
| OAuth refresh failures | window **60 min**, **≥ 5** integrations newly `needs_reconnect` for one provider (provider-wide signal, not single-user) | `OAUTH_FAIL_WINDOW_MIN=60`, `OAUTH_FAIL_MIN_COUNT=5` |
| Billing webhook failures | **≥ 3** processing failures in **60 min**; **≥ 5** `invalid_signature` in **10 min** → critical (misconfig/attack) | `BILLING_WH_FAIL_COUNT=3`/`WINDOW=60`, `BILLING_WH_SIG_BURST=5`/`WINDOW=10` |
| Cron failures | `last_status='failed'` (explicit) **OR** `consecutive_failures ≥ 3` **OR** `now - last_success_at > expected_interval × 3` (missing run) | `CRON_MISSING_MULTIPLIER=3`, `CRON_CONSEC_FAIL=3` |
| Cooldown (all) | re-deliver an open alert at most every **60 min** unless severity escalates | `ALERT_COOLDOWN_MIN=60` |
| Evaluator cadence | run every **5 min** | cron schedule in `vercel.json` |

---

## 5. Data model

**New tables are needed** — the existing tables cover *signals derivable from runs
and integrations* (A, C, D, and B-post-WIP) but cannot answer **cron run history (F)**
or **billing webhook failures (E)**, and there is no durable home for the **alert
dedupe/cooldown state** that prevents spam. Two **system tables** (service-role
only, no user scope), following the `mcp_request_audit` precedent:

### 5.1 `ops_signal_events` — append-only safe signal log

- **Purpose:** durable home for signals lacking one: cron run heartbeats (every
  tick: `source`=cron name, `outcome`=`ok|failed`, `detail_code`) and billing
  webhook processing failures (`source`=`stripe_billing`, `outcome`=`failed`,
  `detail_code`=`invalid_signature|bad_request|processing_error`). Enables explicit
  + missing-run cron detection (`MAX(created_at)` per source) and billing-webhook
  failure counts.
- **Columns:** `id`, `kind` (`cron_run` | `billing_webhook_failure`), `source`
  (text), `outcome` (`ok`|`failed`), `detail_code` (safe enum/text), `created_at`.
  **No payloads, no messages, no provider bodies, no secrets.**
- **Posture:** `-- system-table` header; RLS ENABLED + deny-all policy
  (`FOR ALL USING (false) WITH CHECK (false)`); `GRANT ... TO service_role` only.
- **Service-role reason:** cron + webhook write with no user session; reads are
  server-side evaluator only.
- **Retention:** cleanup cron deletes rows older than `OPS_SIGNAL_RETENTION_DAYS`
  (default 30). FK-free (no parent), so a standalone delete-by-age tick.

### 5.2 `ops_alert_events` — alert record + dedupe/cooldown

- **Purpose:** the durable alert ledger AND the dedupe/cooldown state machine.
- **Columns:** `id`, `category` (enum), `severity` (`warning`|`critical`),
  `dedupe_key` (text), `status` (`open`|`resolved`), `first_seen_at`,
  `last_seen_at`, `occurrence_count` (int), `window_label` (text),
  `context` (jsonb — **safe only**: counts, provider key, workflow/run/job/account
  *ids*, recommended-action string), `last_delivered_at`, `resolved_at`,
  `created_at`. Partial unique index on `(dedupe_key) WHERE status='open'` so only
  one open alert per key (single-winner claim).
- **Posture:** identical system-table posture as above.
- **Service-role reason:** written/read by the server-side evaluator only.
- **Retention:** resolved rows older than `OPS_ALERT_RETENTION_DAYS` (default 90)
  cleaned by the same cleanup tick.
- **No-secret rule:** `context` is built by a pure allow-list helper; **never**
  contains tokens, webhook bodies, provider raw payloads, email/message contents,
  signed URLs, Stripe raw events, scopes, or error message strings.

> Alternative considered: reuse `notifications`. Rejected — it is RLS-scoped to a
> single `user_id`, its type enum is customer-facing, and it has no cooldown state.
> Internal alerts are not customer notifications.

`cron_run_status` upsert-only variant (one row per cron) was considered instead of
`ops_signal_events` for F; rejected because the append-only log also serves E and
lets the failure-rate rules compute over a window. (Open question O-1 below.)

---

## 6. Tests (mapped to `docs/rules/testing-strategy.md` matrix)

Pure rules in `tests/unit/core/observability/`; evaluator/readers in
`tests/unit/services/observability/` + `tests/unit/repositories/`; route in
`tests/integration/`; no-leak/structure in `tests/structure/`.

| Matrix case | Test |
|---|---|
| **Good path** | Signals below every threshold → evaluator fires **zero** alerts; no `ops_alert_events` insert. |
| **Bad path** | Each category at-threshold → exactly one typed `OpsAlertEvent` of the right category/severity emitted. (6 tests, one per category, incl. interim stuck-run proxy for B.) |
| **Missing dependency** | A reader throws (DB error) → evaluator isolates it, still evaluates the other categories, logs `ops.alert.reader_failed`; does not crash the tick. |
| **Upstream/provider failure** | Owner webhook delivery throws / non-2xx → alert is **still recorded** in `ops_alert_events` + logged; delivery failure isolated (mirrors `notifyWorkflowFailure` channel isolation). |
| **User/internal-facing content** | Fired alert payload contains category, severity, scope ids, `firstSeenAt`/`lastSeenAt`, count + window, and a recommended action (reconnect CTA for D). Asserts the human-actionable shape. |
| **State integrity — no duplicate alerts** | Same breaching condition on two consecutive ticks within cooldown → **one** delivery; `occurrence_count` increments; no second `open` row (partial-unique-index claim). |
| **State integrity — no secret leakage** | Construct alerts from inputs seeded with tokens / Stripe raw event / step error messages / emails; assert serialized payload + log line contain **none** of them (string-scan, like the existing no-leak tests). |
| **Parity** | `tests/parity/duplicate-webhook-delivery` precedent: billing-webhook-failure signal does not double-count a Stripe retry of the same `event_id`. |

---

## 7. Implementation slices (after this audit is approved)

Small, local-only commits. Each ships impl + tests + doc note in the same batch
(living-documentation rule). **No push, no db:push, no deploy** without explicit
approval.

- **A. Audit doc (this file).** Signal inventory + plan. ← *current deliverable.*
- **B. Contract + core + evaluator skeleton.** `contracts/opsAlert.ts`,
  `core/observability/{alertThresholds,evaluateRules,dedupe}.ts` (pure) +
  unit tests (good/bad/dedupe/no-leak on pure rules). Evaluator service wired to
  **stubbed** readers so the orchestration is testable before DB work.
- **C. Repositories / readers.** `repositories/opsSignalEvents.ts`,
  `repositories/opsAlertEvents.ts`, reader fns for stuck runs + provider-failure
  aggregation (`workflowRuns`) + needs_reconnect rollup (`integrations`). Two new
  migrations (§5) with RLS + GRANT + system-table headers → `lint:migrations`.
  *(Queue-depth reader stubbed/guarded — see F note.)*
- **D. Delivery + dedupe/cooldown wiring.** `services/observability/delivery.ts`
  (structured log always; optional env webhook `OPS_ALERT_WEBHOOK_URL`), full
  dedupe/cooldown against `ops_alert_events`.
- **E. Cron route + signal producers + structured logs.**
  `app/api/cron/evaluate-ops-alerts/route.ts` (+ `vercel.json` entry),
  `services/observability/recordCronRun.ts` called from each cron route, billing
  webhook failure recording in `stripeBillingWebhook.ts`, retention cleanup tick.
- **F. Integration/route tests + docs closeout.** Route auth + end-to-end
  evaluator tests on a real test schema; runbook (`docs/runbooks/ops-alerts.md`);
  update roadmap Phase 8b + `docs/PROJECT_MEMORY.md`.

### Category B decision (locked by Marcus)

**No interim proxy.** Queue backlog is implemented as the **real queue-depth alert**
against `workflow_runs.status='queued'` (depth + oldest-queued age). Because the
durable-queue substrate is uncommitted WIP (§0) and the `'queued'` enum is not yet
applied, the queue reader is **gated** behind `QUEUE_BACKLOG_MONITORING_ENABLED`
(default `false`) — a narrow, operationally-justified flag (querying a non-existent
enum value errors). While gated, the evaluator reports category B as
**`unmonitored:awaiting_durable_queue`** in its structured log — **never green / OK**,
and it does **not** fire a stuck-`running` proxy alert. When the durable-queue
prerequisite lands and the migration is applied, flip the flag and the real
queue-depth alert activates with zero rule changes. The parallel session's queue WIP
is **not** taken over or committed by this arc.

---

## 8. Blocked / follow-up items (honest)

- **Queue backlog (B)** is **blocked-by-future-infra**: a true depth metric needs
  the uncommitted durable-queue WIP (§0) to land. Interim alert = stuck-`running`
  proxy. Follow-up: switch the reader to `status='queued'` depth + oldest age once
  `20260713000000` is applied.
- **Billing reconciliation drift** (roadmap wording, broader than webhook failures)
  needs a parity-style reconciliation reader over `task_billing_events` /
  reservations; **out of scope for this slice** — flagged as a separate follow-up.
  This slice covers billing **webhook** failures (E) only.
- **Generic per-provider proactive health** (beyond Slack's `check-slack-health`)
  is not built; D relies on the reactive `needs_reconnect_at` signal. Acceptable
  pre-launch; a token-refresh cron is a separate Phase-8 item.
- **No admin dashboard** in this slice by design. Alerts land in `ops_alert_events`
  (queryable) + logs + optional webhook. A read-only ops view is a later slice.

### Open questions for Marcus

- **O-1 (data model):** confirm two append-only system tables (`ops_signal_events`
  + `ops_alert_events`) vs a smaller upsert `cron_run_status` for F. Recommendation:
  the two-table append-only design (serves E + F + windowed rules).
- **O-2 (delivery):** owner outbound channel for launch — env-gated **Slack/Discord
  incoming webhook** (`OPS_ALERT_WEBHOOK_URL`, smallest real outbound) vs building an
  email channel (the declared-but-unbuilt notifications email channel). Recommendation:
  webhook now; email later. Table + logs fire regardless.
- **O-3 (scope):** implement B (interim stuck-run proxy) now, or defer category B
  entirely until the durable-queue WIP is committed?

### Ops / env steps Marcus must configure (when slices B–F ship)

- `OPS_ALERT_WEBHOOK_URL` (optional outbound; unset = table + logs only).
- Threshold env overrides (§4) — only if defaults need tuning.
- `vercel.json` cron entry for `/api/cron/evaluate-ops-alerts` (every 5 min) — added
  in slice E; deploy is push-gated and **requires explicit approval**.
- Apply the two new migrations via `db:push` — **requires explicit approval** (the
  shared in-flight durable-queue migration `20260713000000` is untracked; do not
  apply it as a side effect of applying the alert migrations).
