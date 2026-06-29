# Runbook: Internal / Owner Ops Alerts (Phase 8b)

Internal launch-readiness alerts for the owner/ops — **not** customer-facing
notifications. Design + rationale: [`../slices/phase-8/launch-alerts-audit-plan.md`](../slices/phase-8/launch-alerts-audit-plan.md).

## What it is

A cron-driven evaluator (`/api/cron/evaluate-ops-alerts`, every 5 min) reads
launch-readiness signals, applies conservative thresholds, dedupes/cooldowns, and
delivers owner alerts. There is no third-party monitor — everything is built on
existing logs, DB tables, and cron routes.

**Six categories:** stuck workflow runs, queue backlog, high provider failure rate,
OAuth refresh failures, billing webhook failures, cron failures.

## Where alerts go

1. **Structured log (always):** `event: "ops.alert.fired"` with safe fields
   (category, severity, dedupeKey, count, window, context, recommendedAction).
   Searchable in Vercel logs. The per-tick summary is `event: "ops.alert.evaluated"`.
2. **Durable ledger (always):** `ops_alert_events` table — one open row per active
   condition, plus dedupe/cooldown state and resolved history.
3. **Optional webhook:** if `OPS_ALERT_WEBHOOK_URL` is set, each delivered alert
   POSTs `{ text, content }` (works for a Slack or Discord incoming webhook). Unset
   → table + logs only (still real, never a fake "OK").

**No secrets ever leave:** alerts carry ids/counts/provider keys only — never
tokens, webhook bodies, provider payloads, message contents, signed URLs, Stripe
raw events, or PII.

## Tables

| Table | Purpose | Posture |
|---|---|---|
| `ops_signal_events` | append-only cron heartbeats + billing-webhook failures | system-table, service-role only, RLS deny-all |
| `ops_alert_events` | alert ledger + dedupe/cooldown state | system-table, service-role only, RLS deny-all |

Retention runs inside each evaluator tick: `ops_signal_events` older than
`OPS_SIGNAL_RETENTION_DAYS` (default 30) and resolved `ops_alert_events` older than
`OPS_ALERT_RETENTION_DAYS` (default 90) are deleted.

## Dedupe / cooldown

One open alert per `dedupe_key` (e.g. `provider_failure_rate:slack`). A still-breaching
condition re-delivers at most once per `OPS_ALERT_COOLDOWN_MIN` (default 60 min)
unless severity escalates (warning → critical re-delivers immediately). When a
condition clears, its open alert is marked `resolved`. This is what stops alert spam.

## Categories, thresholds, and how to respond

All thresholds are env-overridable (see Config). Defaults below.

| Category | Trips when | First response |
|---|---|---|
| **stuck_runs** | ≥ 3 `running` rows older than 15m (critical ≥ 30m) | Check the execution engine / run-queue processor. The stale-run sweep finalizes at 60m; a rising count means dispatch is stuck. |
| **queue_backlog** | depth > 100 **or** oldest queued > 10m | Check `/api/cron/process-run-queue` + inline drain. Reads real `status='queued'` depth; if the read fails (e.g. durable-queue migration not applied) it reports `unmonitored:read_failed`, never healthy. |
| **provider_failure_rate** | per provider: ≥ 20 attempts in 15m **and** > 50% failed (critical ≥ 80%) | Check that provider's status / scopes / rate limits. Attribution is by the failed step's node provider. |
| **oauth_refresh_failures** | ≥ 5 integrations of one provider newly need reconnect in 60m | Likely a provider-wide token/scope issue. Review `/apps`; check the provider's OAuth status / app config. |
| **billing_webhook_failures** | ≥ 3 processing failures in 60m; ≥ 5 signature failures in 10m (critical) | Verify `STRIPE_BILLING_WEBHOOK_SECRET` + endpoint config. A signature spike can mean misconfig or spoofing. |
| **cron_failures** | a cron's last run failed, or ≥ 3 consecutive failures, or no success in 3× its expected interval | Check that cron's logs + `CRON_SECRET`; confirm it is scheduled in `vercel.json`. |

Monitored crons + cadence live in
[`services/observability/cronExpectations.ts`](../../services/observability/cronExpectations.ts)
(source of truth = `vercel.json`). Keep them in sync when crons change.

## Queue-backlog monitoring (category B) — on by default

Queue backlog is the **real** queued-depth alert and is **always on — no feature
flag**. The evaluator reads `workflow_runs.status='queued'` depth + oldest-queued
age every tick. It just works once the durable-queue migration
(`20260713000000_workflow_runs_durable_queue.sql`, DURABLE-QUEUE-1) is applied (that
migration makes the `'queued'` enum valid). If the depth read fails — e.g. the
migration is not yet applied, so `status='queued'` is invalid, or any DB error — the
evaluator reports the category `unmonitored:read_failed` and fires nothing. It
**never** reports the queue healthy on a failed read. So the only prerequisite is the
migration; there is nothing to "enable".

A separate **queued-age finalizer** (in the `sweep-stale-runs` reaper cron) fails any
run stuck `queued` past 30 minutes (`STALE_QUEUED_RUN_DEFAULT_AGE_MS`) so a wedged
worker never leaves runs hanging — the alert surfaces the condition, the finalizer
gives each run a real terminal state.

## Config (env)

| Env | Default | Meaning |
|---|---|---|
| `OPS_ALERT_WEBHOOK_URL` | (unset) | Slack/Discord incoming webhook for owner alerts. Unset → table + logs only. |
| `OPS_ALERT_COOLDOWN_MIN` | `60` | Min minutes between re-deliveries of the same open alert. |
| `OPS_SIGNAL_RETENTION_DAYS` | `30` | Retention for `ops_signal_events`. |
| `OPS_ALERT_RETENTION_DAYS` | `90` | Retention for resolved `ops_alert_events`. |
| `OPS_ALERT_STUCK_RUN_*`, `OPS_ALERT_PROVIDER_FAIL_*`, `OPS_ALERT_OAUTH_FAIL_*`, `OPS_ALERT_BILLING_WH_*`, `OPS_ALERT_CRON_*`, `OPS_ALERT_QUEUE_*` | see [`alertThresholds.ts`](../../core/observability/alertThresholds.ts) | Per-category threshold overrides. Invalid/≤0 falls back to default. |
| `CRON_SECRET` | (required) | Bearer secret for the evaluator + all cron routes. |

## Manual run

```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://chainreact.app/api/cron/evaluate-ops-alerts
```

Returns counts only: `{ ok, fired, delivered, suppressed, resolved, queueMonitored,
candidateCount, readerErrors, retention }`.

## Pre-launch ops checklist

- [ ] Apply migrations `20260714000000_ops_signal_events.sql` + `20260714000001_ops_alert_events.sql` (`db:push`).
- [ ] Set `OPS_ALERT_WEBHOOK_URL` (optional but recommended for push delivery).
- [ ] Confirm `/api/cron/evaluate-ops-alerts` is in `vercel.json` (every 5 min) and deployed.
- [ ] Apply the DURABLE-QUEUE-1 migration `20260713000000_workflow_runs_durable_queue.sql` (`db:push`) — this is REQUIRED for durable execution itself (enqueue writes `status='queued'`), and queue-backlog monitoring then works automatically. No flag to set.
- [ ] Tune thresholds after observing real traffic for a few days.

## Known limitations / follow-ups

- **Queue backlog** works by default once the DURABLE-QUEUE-1 migration is applied
  (no flag). Reader, rule, queued-age finalizer, and `process-run-queue` cron
  monitoring are all live.
- **Billing reconciliation drift** (ledger vs counters) is broader than webhook
  failures and is a separate follow-up — not covered here.
- **Reader outages** (a signal reader throwing) degrade that category to "no signal"
  and are surfaced in the per-tick `ops.alert.evaluated` log's `readerErrors` — they
  are logged, not paged. A future evaluator-self-health meta-alert could page on them.
- Provider failure attribution uses the workflow's current node map (approximation
  across edits; node ids/providers are stable).
- A read-only ops dashboard is intentionally out of scope; alerts live in
  `ops_alert_events` + logs + the optional webhook.
