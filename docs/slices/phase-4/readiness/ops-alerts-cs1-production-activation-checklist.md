# 4.OPS-ALERTS — CS-1 Production Activation Checklist

**Type:** Operational checklist / runbook. **Docs only. No source, migrations,
tests, or behavior changed in this slice. Nothing pushed.**
**Date:** 2026-07-01
**Branch:** `v2-main`
**Owner-gated:** every step here (db:push / env / deploy) is a production change that
**Marcus performs when ready**. This document does NOT execute any of them.

**Related:**
[ops-alerts-launch-readiness-audit.md](./ops-alerts-launch-readiness-audit.md) (the audit — G1/G2/G3 are the steps below) ·
[../../../runbooks/ops-alerts.md](../../../runbooks/ops-alerts.md) (how the system works day to day) ·
CS-2 harness [tests/integration/observability/ops-alerts.evaluator.dev.test.ts](../../../../tests/integration/observability/ops-alerts.evaluator.dev.test.ts) (`0e7fb0931`) ·
evaluator [route](../../../../app/api/cron/evaluate-ops-alerts/route.ts) · [delivery](../../../../services/observability/delivery.ts) · [vercel.json](../../../../vercel.json)

The alerting code shipped in Phase 8b and is verified end to end (CS-2). Activation is
**three owner actions in order** — migrations, env, deploy — plus a verify pass. Nothing
new to build.

---

## 1. Preconditions (confirm before touching prod)

- [ ] **CS-2 e2e harness passed on dev.** `ALLOW_DB_INTEGRATION_TESTS=true npm run smoke:ops-alerts` → 4/4 pass (fire 7 / deliver 7 → suppress 7 → resolve 7 → 0 leaked). Last verified 2026-07-01 on the dev DB.
- [ ] **Observability unit suite green.** `npx jest tests/unit/core/observability tests/unit/services/observability` → 43 pass.
- [ ] **Migrations identified** (§2) and reviewed. All three already exist in `supabase/migrations/`.
- [ ] **Owner approval** to make prod DB + env + deploy changes. This checklist is the plan; Marcus is the actor.
- [ ] Decide the §7 owner questions (webhook destination, timing, controlled test) before starting.

---

## 2. Required prod migrations (apply with `db:push`, owner-gated)

Apply to the production DB in filename order. All three are forward-only and already
committed to the repo.

| Order | Migration file | What it adds | Why required |
|---|---|---|---|
| 1 | `supabase/migrations/20260713000000_workflow_runs_durable_queue.sql` | `workflow_runs.status='queued'` enum + `(status, created_at)` index | Without it the **queue backlog** reader throws → that category reports `unmonitored:read_failed` (never green, but not monitored). Also required for durable execution itself. |
| 2 | `supabase/migrations/20260714000000_ops_signal_events.sql` | `ops_signal_events` (append-only cron heartbeats + billing-webhook failures; system-table, RLS deny-all, service-role GRANT) | Source of the **cron failures** + **billing webhook failures** signals. Cron heartbeats + billing failure recording write here in prod once deployed. |
| 3 | `supabase/migrations/20260714000001_ops_alert_events.sql` | `ops_alert_events` (alert ledger + dedupe/cooldown; system-table, RLS deny-all, service-role GRANT; partial unique index on `(dedupe_key) WHERE status='open'`) | The durable alert record + the single-open-row-per-key claim that prevents spam. |

- [ ] `npm run lint:migrations` (sanity) — *owner may run; not run in this slice.*
- [ ] Apply migration 1, then 2, then 3 via `db:push` against the prod DB URL.
- [ ] Confirm the three tables/enum exist in prod.

> The other four readers (**stuck runs**, **queue backlog**, **provider failure rate**,
> **OAuth refresh failures**) read tables that already exist in prod (`workflow_runs`,
> `integrations`) — no migration needed beyond #1's `queued` enum.

---

## 3. Required env

| Var | Required? | Effect |
|---|---|---|
| `OPS_ALERT_WEBHOOK_URL` | **Recommended for launch** | A Slack or Discord **incoming webhook** URL. When set, each delivered alert POSTs `{ text, content }` (5s timeout, never throws). **Currently unset** in `.env.local` / `.env.example`. |
| `CRON_SECRET` | Already set | Bearer token the evaluator route (and all crons) require. Confirm it is present in prod. |
| `OPS_SIGNAL_RETENTION_DAYS` | Optional | Default 30. Signal-log retention. |
| `OPS_ALERT_RETENTION_DAYS` | Optional | Default 90. Resolved-alert retention. |
| `OPS_ALERT_*` thresholds | Optional | All defaults are conservative (see the audit §7 / `core/observability/alertThresholds.ts`). Only set to tune. |

- [ ] Create the ops Slack/Discord incoming webhook and set `OPS_ALERT_WEBHOOK_URL` in prod.

> **Structured logs work WITHOUT the webhook** — every alert always emits
> `event: "ops.alert.fired"` and each tick emits `event: "ops.alert.evaluated"` to Vercel
> logs, and the durable `ops_alert_events` row is always written. **But active paging does
> NOT happen until `OPS_ALERT_WEBHOOK_URL` is set** — until then a human must watch logs.
> Treat setting the webhook as a launch requirement, not optional.

---

## 4. Deployment (activate the cron, owner-gated)

- [ ] Deploy the current `v2-main` to production.

The every-5-minute schedule is already declared in `vercel.json`
(`/api/cron/evaluate-ops-alerts`, `*/5 * * * *`). It only runs once deployed; Vercel cron
sends `GET` with `Authorization: Bearer $CRON_SECRET`. No `vercel.json` edit needed.

---

## 5. Post-deploy verification

- [ ] **Manual trigger** (don't wait 5 min): `curl -X POST https://<prod-host>/api/cron/evaluate-ops-alerts -H "Authorization: Bearer $CRON_SECRET"`. Expect HTTP 200 and a JSON summary `{ ok, fired, delivered, suppressed, resolved, queueMonitored, candidateCount, readerErrors, ... }` (counts only — no ids).
- [ ] **Cron is live:** confirm the scheduled tick appears in Vercel cron logs at the 5-min cadence.
- [ ] **Structured logs:** confirm `event: "ops.alert.evaluated"` per tick in Vercel logs.
- [ ] **No reader errors:** the summary's `readerErrors` array is `[]` and `queueMonitored` is `true` (proves migration #1 applied; `unmonitored:read_failed` in the log means the durable-queue migration is missing).
- [ ] **Webhook delivery (if configured):** on a real (or the §7 controlled) alert, confirm the message lands in the ops Slack/Discord channel and there is no `event: "ops.alert.webhook_failed"` log.
- [ ] **Alert lifecycle:** on a genuine breach, confirm an `ops_alert_events` open row is created (`event: "ops.alert.fired"`), that re-ticks within cooldown do NOT re-deliver (suppressed), and that the row flips to `resolved` once the condition clears. (CS-2 already proves this loop on dev; this just confirms prod wiring.)

---

## 6. Rollback / disable plan

Fastest-to-slowest, least-to-most disruptive:

- [ ] **Stop active external paging:** unset `OPS_ALERT_WEBHOOK_URL` (or point it at a muted channel). Alerts keep recording to `ops_alert_events` + logs; only the outbound POST stops. No deploy needed if the platform applies env changes without one; otherwise redeploy.
- [ ] **Stop evaluation entirely:** remove the `/api/cron/evaluate-ops-alerts` entry from `vercel.json` and redeploy (or revert the deploy). The tables + code remain; nothing evaluates.
- [ ] **Full revert:** redeploy the prior release. The ops tables are inert without the cron.
- [ ] **Keep DB rows for audit.** Do **not** drop `ops_signal_events` / `ops_alert_events` or delete rows on rollback — they are the incident record. Retention already prunes them (30/90 days). Only clean up if Marcus explicitly approves.

> The evaluator is fail-safe by design: a throwing reader is isolated (`ops.alert.reader_failed`, safe fallback), delivery never throws, and a missing durable-queue migration reads as `unmonitored`, never a false green. So a partial rollback cannot produce false alerts.

---

## 7. Exact owner decisions (settle before activating)

1. **Webhook destination:** which Slack or Discord channel gets the incoming webhook for `OPS_ALERT_WEBHOOK_URL`? (Recommend a dedicated `#ops-alerts` channel, not a busy general channel.)
2. **Prod migration timing:** when to `db:push` the three migrations (§2). Migration #1 is also a durable-execution prerequisite, so it may already be scheduled independently.
3. **Deploy timing:** when to deploy to activate the 5-min cron (§4). Do it after §2 + §3 so the first tick has tables + a delivery channel.
4. **Controlled prod test:** run one deliberate test alert in prod after activation? (Recommended: yes — e.g. temporarily lower one threshold via env, or manually insert a single throwaway breaching signal, confirm one webhook message, then revert/clean. This is the prod analog of CS-2's fire→deliver→resolve, done once.) Decide who runs it and the cleanup step.

---

## 8. Hard warning

**This slice does NOT run `db:push`, deploy, or `git push`.** It only writes this
checklist. Every action in §2 / §4 / §6 is a production change for Marcus to perform
deliberately when ready. Do not execute any of them from this slice.

---

## Acceptance criteria (this doc)

Checklist exists under `docs/slices/phase-4/readiness/`, cites the real migration
filenames + env var + cron route/schedule + log event names (all verified against the
repo), sequences the three owner actions with a verify pass and a rollback plan, and
changes no code. Nothing pushed.
