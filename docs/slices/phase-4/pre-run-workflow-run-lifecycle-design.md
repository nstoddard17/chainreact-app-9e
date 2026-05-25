# Pre-Run `workflow_runs` Row Lifecycle — Design (Slice 4.COST-15A)

**Status:** design / audit only. **No runtime, schema, or migration changes ship in this slice.**

**Purpose.** Live reserve/reconcile billing (COST-15D) must attach a reservation to a **durable `workflow_runs` row before any billable side effect occurs**. Today the engine writes that row only at *finalize* (after execution). This document audits the current lifecycle, explains exactly why a pre-run row is required, evaluates options, and specifies the future lifecycle + the schema / repository / failure-handling changes needed — so COST-15B+ can implement against a settled design.

**Boundaries honored by this slice:** no engine wiring, no live-billing change, no balance-mutating reserve/reconcile RPC call from the engine, no UI, no owner route, AI/templates/custom-nodes paused. Cross-refs: [reserve-reconcile-billing-design.md](./reserve-reconcile-billing-design.md) (COST-11 model + COST-12..14E notes).

---

## COST-15B — schema + repository foundation (shipped)

The §5/§6 changes landed as the **data/repository layer only — the engine is NOT wired (that is COST-15C) and live billing is unchanged.**

- **Migration** [`20260525000004_workflow_runs_pre_run_lifecycle.sql`](../../../supabase/migrations/20260525000004_workflow_runs_pre_run_lifecycle.sql): (1) `ALTER TYPE public.workflow_run_status ADD VALUE IF NOT EXISTS 'running'` (the non-terminal pre-run state); (2) `ALTER TABLE public.workflow_runs ALTER COLUMN finished_at DROP NOT NULL`. **No billing columns added** (COST-12 already has them); **no backfill** (existing terminal rows stay valid — a nullable column accepts every existing non-null value, and the `WHERE status='failed'` partial index is unaffected). **Applied to the confirmed dev DB** (`qcepijemjlkssfkvzlio`) via `npm run db:push` and functionally verified end-to-end (throwaway user → INSERT `running`/`finished_at=NULL` accepted → finalize UPDATE → cascade cleanup; 7/7 checks, 0 residue).
- **Repository** [`repositories/workflowRuns.ts`](../../../repositories/workflowRuns.ts) gains four service-role methods + types: `createWorkflowRunStart` (INSERT pre-run row; PK conflict ⇒ `{created:false}`, no throw, no overwrite — duplicate-dispatch guard), `finalizeWorkflowRun` (UPDATE to terminal; **never touches `billing_status`/reservation/reconcile columns**; missing row ⇒ `{finalized:false}`, no insert fallback), `markWorkflowRunFailedBeforeExecution` (UPDATE → failed, no billing mutation), `getWorkflowRunForBilling` (billing/lifecycle projection — ids/status/cost/reservation only, **no `trigger_event`/`steps`/payloads**). New `WorkflowRunLifecycleStatus` (`running|succeeded|failed`) + `WorkflowRunBillingRecord` types.
- **Compatibility:** `recordRun` (finalize-only INSERT) + `getById`/`listByWorkflow` and their display types (`WorkflowRunStatus`, `WorkflowRunRecord`) are **unchanged** — they serve the API/UI, which only ever read terminal rows until the engine is wired. Widening the display `status` to include `running` and making display `finishedAt` nullable is **deferred to COST-15C**, when running rows first become user-visible (it ripples into `WorkflowRunSummarySchema` + UI; out of scope here).
- **Tests:** [`tests/unit/repositories/workflowRuns.test.ts`](../../../tests/unit/repositories/workflowRuns.test.ts) — 14 new cases (25 total): create-running/finished_at-null/billing-unset, duplicate-PK safe, finalize→succeeded/failed, **billing-field preservation**, unsupplied-cost-columns-untouched, finalize-no-row, mark-failed, billing projection mapping + no-payload-leak, error propagation.

---

## COST-15C — engine wired to create-at-start + finalize-update (shipped, flat mode)

The engine now writes the run row at the **start** of execution and **UPDATEs the same row** at finalize. **Flat billing stays authoritative; no reserve/reconcile RPC is called; shadow mode is unchanged.**

- **Engine flow** ([`services/execution/engine.ts`](../../../services/execution/engine.ts)): `runId → load workflow (WORKFLOW_NOT_FOUND → no row) → trigger-node check (TRIGGER_NODE_NOT_FOUND → terminal INSERT via recordRun, no pre-run row) → **createWorkflowRunStart** (status 'running') → flat executionBillingGate (unchanged) → execute → computeRunTaskUsage → **finalizeRun** (UPDATE) → recordRunActuals + shadow (unchanged)`. The row is created **after** the no-row-needed structural fatals and **before** billing — the COST-15A ordering, forward-compatible with reserve mode (COST-15D).
- **Finalize path** (`finalizeRun` helper): UPDATE via `finalizeWorkflowRun` when the pre-run row exists; **fallback to a `recordRun` INSERT** when it doesn't (create failed) or `finalized:false` (row vanished) — a run record is never lost. Never writes `billing_status`/reservation columns. The shared `notifyOnFailure` fan-out runs from the INSERT, UPDATE, and mark-failed paths identically (notification behavior unchanged, incl. on BILLING_EXHAUSTED).
- **Fatal handling:** `BILLING_EXHAUSTED` after the row exists → `markWorkflowRunFailedBeforeExecution` (UPDATE → failed; no duplicate INSERT, no billing mutation). Pre-row fatals keep the terminal-INSERT path.
- **Duplicate dispatch:** `createWorkflowRunStart` returning `{created:false}` (same runId already has a row) → the engine logs `execution.run.duplicate_dispatch`, returns a non-persisted `DUPLICATE_DISPATCH` result, and **does NOT execute, bill, or mutate the existing row** (idempotency guard; runId added to `RunFailureCode`). Normal retries use a fresh runId and are unaffected.
- **Running-row exposure decision (Part C):** display types (`WorkflowRunStatus`, `WorkflowRunRecord`, `WorkflowRunSummarySchema`) and the UI are **unchanged**. Instead, the user-facing reads **filter out running rows**: `listByWorkflow` adds `.neq("status","running")`; `getById` excludes running rows (an in-progress run reads as not-yet-available / `null`). This preserves the pre-COST-15C UX (a run appears only once finalized) and keeps the terminal-only contract valid (a `running` row would otherwise fail `WorkflowRunSummarySchema` validation). Surfacing in-progress runs in the UI is a future UI slice.
- **Flat billing / shadow / usage unchanged (proven by tests):** real runs call `executionBillingGate(userId,{testMode:false})` and deduct via the flat path; test runs call it with `{testMode:true}` and don't deduct; `reserveTasks`/`reconcileReservation`/`releaseReservation` are **never** called; COST-3 actual-usage recording + cost columns (now written on the finalize UPDATE) + `task_usage_events` (same runId) + COST-14 shadow (≤1 row/run, none in test mode, fail-open) all behave as before.
- **Tests:** 7 new engine cases ([`tests/unit/services/execution/engine.test.ts`](../../../tests/unit/services/execution/engine.test.ts) "pre-run row lifecycle") — create→finalize same runId, mid-run failure finalizes failed, duplicate no-op, create-failure INSERT fallback, finalize-no-row INSERT fallback, flat-authoritative + reserve-not-called, test-run create + no-bill — plus the existing persistence/provenance/cost/billing tests migrated to the create/finalize/mark assertions. 2 repo filter assertions for the running-row exclusion. Full suite green (12360 tests).
- **Stale 'running' rows:** addressed by COST-15F below.

---

## COST-15F — stale 'running' run sweep (shipped)

Crash recovery for the COST-15C lifecycle: a process that dies between `createWorkflowRunStart` and finalize leaves a row stuck in `status='running'` (hidden from the UI by the COST-15C read filter). A sweep marks such rows failed after a staleness cutoff. **Lifecycle cleanup only — no billing change.**

- **Staleness criteria:** `status='running'` AND `finished_at IS NULL` AND `started_at < cutoff`. `started_at` is the staleness clock (NOT NULL, set when execution began — more meaningful than the `created_at` insert time). Default cutoff: **60 minutes** (`STALE_RUNNING_RUN_DEFAULT_AGE_MS`).
- **Repository** [`repositories/workflowRuns.ts`](../../../repositories/workflowRuns.ts) `sweepStaleRunningWorkflowRuns({ cutoff, fatalError, errorClassification, finishedAt, limit? })` → `{ sweptCount, runIds, cutoff }`. Single UPDATE (`status='failed'`, `finished_at`, `fatal_error`, `error_classification`); optional `limit` via pre-select of the oldest ids then an UPDATE scoped to them that **re-applies the full predicate** (race-safe). **Never writes** `billing_status` / `reserved_task_cost` / `reconciled_task_cost` / `reservation_id` / `reservation_expires_at` / `billing_reconciled_at`; no task deduct/refund; no `task_usage_events`.
- **Service** [`services/execution/staleWorkflowRunSweep.ts`](../../../services/execution/staleWorkflowRunSweep.ts) `sweepStaleRunningWorkflowRuns({ olderThanMs?, now?, limit? })` — builds the cutoff + the **`EXECUTION_INTERRUPTED`** fatal and its humanized classification (via `core/errors/humanizeActionError` — title "Run interrupted", severity error, no CTA), delegates to the repo. Canonical, unit-tested entry point.
- **Ops script** [`scripts/sweep-stale-workflow-runs.mjs`](../../../scripts/sweep-stale-workflow-runs.mjs) (`npm run sweep:stale-runs`) — guarded by `ALLOW_STALE_RUN_SWEEP=true`; `--older-than-minutes` / `--limit` / `--dry-run`. Mirrors the service (a `.mjs` can't import TS; same precedent as the verify scripts). **Not scheduled by this slice** — cron/route wiring is a future deployment decision.
- **Idempotency:** the predicate stops matching a row once swept; terminal rows and not-yet-stale running rows are never touched.
- **Separate from billing:** distinct from the COST-12 `release_expired_reservations` RPC, which reclaims reserved **billing holds**. This sweep is run-lifecycle state only.
- **Tests:** repo (5 cases: mark+preserve-billing, idempotent, limit pre-select+IN, limit-no-match short-circuit, error) + service (6: cutoff math, default threshold, EXECUTION_INTERRUPTED payload, limit pass-through, outcome shape, no-billing-path) + humanizer (2: EXECUTION_INTERRUPTED + empty-message fallback). **Functionally verified on the dev DB** via the real ops script (11/11: stale→failed, `billing_status`/`reserved_task_cost` preserved, fresh-running + terminal untouched, idempotent on re-run, 0 residue).

---

## COST-15H — engine live reserve/reconcile behind the global flag (shipped, pre-launch)

The engine now uses reserve/reconcile as the **live** billing path when `ENABLE_RESERVE_RECONCILE_BILLING=true`, with the flat gate as the disabled/rollback path. **No internal-user allowlist** — the app is pre-launch with no external users (decision 2026-05-25), so the global flag is the only switch. **This is the first balance-affecting reserve/reconcile engine integration.**

- **Billing decision** (in `runWorkflow`, after `createWorkflowRunStart`): `reserveReconcileMode = !isTest && isReserveReconcileEnabled()`.
  - **Flag off → flat** `executionBillingGate` / `deduct_tasks_if_available` — byte-for-byte today's behavior (the rollback path; never removed).
  - **Flag on (real run) → reserve/reconcile:** estimate `estimateWorkflowTaskCost(def).estimatedTasksPerRun` → `createBillingReservation` (COST-13 service → `reserve_tasks_if_available`) **before any handler**. Reserve refused (insufficient / run_not_found / rpc_error) → **`BILLING_EXHAUSTED` before side effects** via the shared `failBeforeExecution` helper (the reserve RPC already stamped `billing_status='failed'` on insufficient). Reserve OK → execute → `reconcileBillingReservation(actual)` (charge `min(actual, reserved)`, refund the rest).
  - **Test/dry-run → no billing in either mode** (`reserveReconcileMode` requires `!isTest`; flat branch returns the COST-2A skip). No reserve, no reconcile, no deduct, no billable ledger, no shadow.
- **Reserve needs the pre-run row** (the RPC keys on it): in reserve mode the COST-15C create is **fail-CLOSED** — if `createWorkflowRunStart` failed, the run aborts with `BILLING_EXHAUSTED` rather than executing without a confirmed hold (flat mode stays fail-open).
- **Reconcile-before-finalize** (deliberate ordering): the charge settles **before** the run-row finalize UPDATE, so the **balance is correct even if finalize later fails**. The alternative (finalize-first) risks a stuck `reserved` hold being released (charged 0) by the expiry sweep on a successful run — underbilling. The residual edge (reconcile OK + finalize fails → row `billing_status='reconciled'` but run status stale `running`) is reclaimed by the COST-15F sweep (billing fields preserved); balance stays correct.
- **`reconcile(0)` is the release-equivalent:** `actual` counts only SUCCESSFUL billable nodes (`computeRunTaskUsage`), so a partial-failure run reconciles the succeeded portion + refunds the rest, and a zero-success run reconciles 0 (refund all). Execution always follows a successful reserve, so **no separate release call exists in the normal flow**; an engine crash between reserve and reconcile is the `release_expired_reservations` sweep's job (COST-12). Reconcile failure is **logged loudly** (`execution.run.billing_reconcile_failed`), never hidden, and never throws (the service returns `ok:false`).
- **Task-usage ledger (Part F):** COST-3 `recordRunActuals` (the `task_usage_events` audit) still runs for real runs in **both** modes — `node_task_charged` rows remain the per-node actual-usage audit; the reserve/reconcile **RPCs own the balance mutation** + the `billing_status`/`reserved`/`reconciled` state on `workflow_runs`. No duplicated balance-affecting ledger writes.
- **Shadow (Part G):** still gated solely by `ENABLE_RESERVE_RECONCILE_SHADOW`, **read-only**, never mutates a balance. In reserve mode `gateOutcome` is null, so shadow has no flat counters to fold (its `flatChargedTasks` stays the hypothetical 1 — a flat-vs-actual migration baseline). Test runs never shadow.
- **Rollback:** flip `ENABLE_RESERVE_RECONCILE_BILLING=false` → the engine reverts to the flat gate immediately; `deduct_tasks_if_available` is intact. Not enabled in any committed env.
- **Tests:** 9 new engine cases ([engine.test.ts](../../../tests/unit/services/execution/engine.test.ts) "live reserve/reconcile billing") — reserve+reconcile happy path (flat gate bypassed, actual passed to reconcile, COST-3 intact), reconcile-before-finalize ordering, insufficient→BILLING_EXHAUSTED (no handler/flat/reconcile), partial-failure reconcile(actual), zero-success reconcile(0), reconcile-failure fail-safe, pre-run-row-missing fail-closed, test-mode no-billing/no-shadow, flag-off rollback. Full suite green (12382 tests). **COST-15I should verify on the dev DB with the flag ON before any broader deployment.**

---

## COST-15I — dev-DB live reserve/reconcile engine verification (shipped)

The COST-15H engine path was exercised **end-to-end against the real dev DB with `ENABLE_RESERVE_RECONCILE_BILLING=true`** — closing the gap that COST-15H's engine unit tests mock the service layer. **No bug found; no engine/RPC change.**

- **Harness:** [`tests/integration/billing/reserveReconcileEngine.dev.test.ts`](../../../tests/integration/billing/reserveReconcileEngine.dev.test.ts) — gated (`ALLOW_DB_INTEGRATION_TESTS=true` + service-role env; self-skips under plain `npm test`/CI). Flag set **in-process only** (`beforeAll`, restored in `afterAll`); dev DB ref `qcepijemjlkssfkvzlio`; no `.env` committed; no production access. Drives the REAL engine; only the outside world is stubbed (mock handler — no provider API; deterministic meta — real `taskCostPolicy`; no-op notifier; cookie client throws). Reserve/reconcile services → repo wrappers → COST-12 RPCs → `user_billing`/`workflow_runs`/`task_usage_events` are all real.
- **Cases (10/10 green, fresh user per case):** one-action reserve 1→reconcile 1; three-action 3→3; branching estimate 2→reconcile 1 (refund 1); trigger-only 0→0; partial-failure 3→reconcile 1 (run failed, `billing_status='reconciled'`); insufficient → `BILLING_EXHAUSTED` before any handler (`billing_status='failed'`, balances untouched, 0 ledger rows); test-mode (no billing/ledger/shadow); flag-OFF rollback (flat 1/run, no reserve/reconcile, COST-3 ledger still records); shadow-ON+reserve (reconcile still the only mutation, one shadow row).
- **Findings:** `tasks_reserved` returned to **0** in every case; `tasks_used` moved by **exactly the reconciled charge** (flat `deduct` never called in reserve mode); refunds matched estimate−actual; `workflow_runs` billing columns + `billing_reconciled_at` correct; ledger wrote one `run_estimate_recorded` + one `node_task_charged` per successful billable node. The §7 failure-handling table — fatal-before-row, reservation failure, partial failure, test mode, duplicate dispatch — was confirmed against real RPC behavior. Engine logs confirmed live ordering: create-at-start → reserve RPC → execute → reconcile RPC → finalize → ledger insert. Cleanup left **0** residue.
- **Gate:** the live engine reserve/reconcile path is **functionally correct on a real DB**. Remaining before pre-launch default: organic representative usage with the flag on + scheduled sweeps (COST-15K) so a crash between reserve and reconcile can't strand a hold. Not production-cutover-ready (that is COST-16). Full COST-15I write-up: [reserve-reconcile-billing-design.md](./reserve-reconcile-billing-design.md) COST-15I implementation note.

---

## COST-15K — scheduled crash-recovery sweeps (shipped)

Closes the §7 crash-recovery gap by **scheduling** the two cleanup sweeps (both were implemented + manually runnable; the gap was that cleanup must be scheduled, not only manual). **Ops/cron wiring only — no reserve/reconcile billing-logic change; flat rollback intact.**

- **Stale-running sweep** ([`/api/cron/sweep-stale-runs`](../../../app/api/cron/sweep-stale-runs/route.ts) → COST-15F `sweepStaleRunningWorkflowRuns`) finalizes rows left `status='running'` by a crash between `createWorkflowRunStart` and finalize (§7 "engine crash before finalization" / "after reservation, before reconcile" run-row half). 60-min cutoff, batched (`?limit=`, default 500). **Lifecycle only — no billing fields touched.**
- **Expired-reservation sweep** ([`/api/cron/release-expired-reservations`](../../../app/api/cron/release-expired-reservations/route.ts) → COST-13 `releaseExpiredBillingReservations` → COST-12 `release_expired_reservations`) reclaims `billing_status='reserved'` holds past `reservation_expires_at` (§7 "engine crash after reservation, before reconcile" billing-hold half). service_role; **not flag-gated** so a rollback can't strand holds.
- **Schedule/auth:** both `*/10 * * * *` in [`vercel.json`](../../../vercel.json), `requireCronAuth` Bearer-`CRON_SECRET`. Together they make the §7 crash rows self-healing: the hold is released and the `running` row is finalized within one tick of the cutoff — the safety property reserve/reconcile needs before it can become the pre-launch default. Full write-up: [reserve-reconcile-billing-design.md](./reserve-reconcile-billing-design.md) COST-15K implementation note.

---

## 1. Current `workflow_runs` lifecycle

Source of truth: [`services/execution/engine.ts`](../../../services/execution/engine.ts) (`WorkflowEngine.runWorkflow` + `persistRun`), [`repositories/workflowRuns.ts`](../../../repositories/workflowRuns.ts), [`services/billing/executionBillingGate.ts`](../../../services/billing/executionBillingGate.ts), [`services/billing/taskUsageRecorder.ts`](../../../services/billing/taskUsageRecorder.ts).

**Where `runId` is generated.** In `runWorkflow`: `const runId = input.runId ?? randomUUID()` (engine entry). The webhook handoff [`enqueue.ts`](../../../services/execution/enqueue.ts) also generates one and passes it in. So `runId` exists **before** any DB write or billing.

**When the row is written today.** Exactly **once, at the end**, via `persistRun` → `workflowRunsRepo.recordRun` — a single **`INSERT`** into `workflow_runs` (the row `id` is the engine `runId`). There is **no row during execution**.

**Data available BEFORE execution** (at `runId` time): `runId`, `workflowId`, `userId`, `triggerNodeId`, `triggerEvent`, `isTest`, `triggeredBy`, the loaded `draftDefinition`, and therefore the **COST-2 estimate** (`estimateWorkflowTaskCost(def)`), `task_cost_policy_version`, `started_at`.

**Data available only AFTER execution:** `status` (succeeded/failed), `steps[]`, `fatal_error`, `error_classification` (humanized), `finished_at`, `actual_task_cost` (sum of successful billable nodes via `computeRunTaskUsage`).

**How success/failure is persisted today.** `persistRun` builds the terminal `RunResult`, computes `error_classification` (`classifyForPersistence`, non-null only when failed), and inserts the row with the terminal `status`. Failed runs additionally fan out one humanized notification (`notifyWorkflowFailure`, best-effort, dedup-claimed).

**How `testMode` affects recording.** `isTest = input.testMode === true`. Test runs **are still persisted** as `workflow_runs` rows (`is_test = true`), but `usage = null` (COST-3 ledger skipped) → cost columns NULL, no `task_usage_events`, and (COST-14) **no shadow row**. The flat gate is **skipped** for test runs (`executionBillingGate({testMode:true})` returns `{ok:true, skipped:true}` with no deduction).

**How fatal-before-execution runs are handled today.** Three pre-execution fatals:
- `WORKFLOW_NOT_FOUND` → returns the fatal result **without** calling `persistRun` (a row is impossible anyway — `workflow_runs.workflow_id` FKs `workflows(id)`).
- `TRIGGER_NODE_NOT_FOUND` → calls `persistRun` (single terminal `failed` INSERT, empty steps, `fatal_error` set), then returns.
- `BILLING_EXHAUSTED` (flat gate refused) → calls `persistRun` (terminal `failed` INSERT), then returns.
In all persisted fatals `usage` is undefined → cost columns NULL.

**How task-usage recording updates run cost fields today.** Two parallel writes after the loop, both keyed on `runId`, both fail-open: (a) `persistRun` writes the denormalized `estimated_task_cost` / `actual_task_cost` / `task_cost_policy_version` **on the same INSERT**; (b) `recordRunActuals` appends `task_usage_events` ledger rows (one `run_estimate_recorded` + one `node_task_charged` per successful billable node). There is **no UPDATE path** — both assume the row is being created now.

**Billing order today (flat):** `runId` → load workflow → trigger-node check → **flat `deduct_tasks_if_available` (the only real balance mutation)** → execute nodes → compute usage → `persistRun` **INSERT** → `recordRunActuals` → (COST-14) shadow. The flat charge happens **before** the run row exists.

---

## 2. Why reserve/reconcile needs a pre-run row

The COST-12 RPCs ([`20260525000002_reserve_reconcile_billing.sql`](../../../supabase/migrations/20260525000002_reserve_reconcile_billing.sql)) **operate on the run row, keyed by `id = p_run_id`**:

- `reserve_tasks_if_available(p_user_id, p_amount, p_run_id, p_expires_at)` — `SELECT billing_status, reserved_task_cost FROM workflow_runs WHERE id = p_run_id`. **If `NOT FOUND` → returns `{ok:false, reason:'run_not_found'}` and mutates nothing.** On success it **UPDATEs the run row** (`reserved_task_cost`, `billing_status='reserved'`, `reservation_id`, `reservation_expires_at`). On insufficient capacity it UPDATEs `billing_status='failed'`.
- `reconcile_task_reservation(p_user_id, p_run_id, p_actual)` — same `WHERE id = p_run_id`; `NOT FOUND → 'run_not_found'`; requires `billing_status='reserved'`; UPDATEs `reconciled_task_cost`, `billing_status='reconciled'`, `billing_reconciled_at`.
- `release_task_reservation(p_user_id, p_run_id)` — same; `NOT FOUND → 'run_not_found'`; UPDATEs `billing_status='released'`.
- `release_expired_reservations(p_now)` — sweeps `workflow_runs WHERE billing_status='reserved' AND reservation_expires_at < now`.

Consequences:
- **The reservation IS the run row.** `billing_status`, `reserved_task_cost`, `reservation_id`, `reservation_expires_at`, `billing_reconciled_at`, `reconciled_task_cost` all live on `workflow_runs`. There is no separate reservation entity.
- **Reserve must precede side effects** (COST-11: hold capacity, then execute within the hold). Reserve requires the row. Therefore **the row must exist before execution** — the opposite of today's finalize-only INSERT.
- **The orphan sweep + idempotency keys all assume a durable row** from reserve time onward (a crash between reserve and reconcile must leave a `reserved` row for the sweep to reclaim).
- **Shadow mode dodged this** because it is computed entirely from *final* run data (estimate re-derived + actuals) and never reserves; it could therefore stay at finalize. Live mode cannot — it mutates balance *before* the outcome is known.

This is the single blocking prerequisite called out in the COST-11/COST-12 notes ("a reservation **is** the run — the caller MUST ensure the run row exists before reserving").

---

## 3. Design options

| Option | Summary | Verdict |
|---|---|---|
| **A — minimal pre-run row at start** | INSERT a row in a non-terminal state (`running`) right before billing; finalize **UPDATEs** the same row. | **Recommended** (with the §5 schema tweaks). Single durable row per run; reservation attaches cleanly; finalize/ledger/shadow already key on `runId`. |
| **B — separate `task_reservations` table** | Hold lives in its own table, joined to the run later. | **Rejected/deferred** (per COST-11 decision #6). The RPCs already key on `workflow_runs`; a second table duplicates state, needs its own idempotency + cleanup, and re-introduces a join the COST-12 design deliberately removed. Revisit only if multi-reservation-per-run or dynamic-count nodes ever require it. |
| **C — reserve without a row, attach later** | Reserve against the balance, write the row at finalize. | **Rejected.** The RPCs cannot reserve without a row (`run_not_found`); a balance-only hold would have no durable anchor for idempotency, the orphan sweep, or audit. Weakens exactly the guarantees COST-12 was built for. |
| **D — keep finalize-only row, no real reservation** | Status quo. | **Rejected for live mode.** Cannot reserve before side effects → cannot prevent overspend before external writes. (This is fine for flat + shadow, which is why it persists until COST-15D.) |
| **E — row after fatal pre-checks, before reserve** | Ordering refinement of A: `runId → no-row-needed fatal checks → INSERT pre-run row → reserve → execute → reconcile/finalize`. | **Recommended ordering** — A's *what* + E's *when*. Avoids creating rows for structural fatals that need no billing, and guarantees the row exists before the first balance touch. |

**Recommendation: Option A (minimal pre-run row) with Option E ordering.** A "reservation is the run row" model with a row created just-in-time, after cheap structural validation and before any balance mutation.

---

## 4. Recommended lifecycle

Forward-compatible and **flag-gated**: the row-creation change ships in **flat mode first** (COST-15C, flat stays authoritative), then reserve/reconcile rides on top behind an allowlist (COST-15D). Steps marked *(reserve mode only)* are no-ops under flat.

1. **Generate `runId`** (unchanged).
2. **Load workflow.** `WORKFLOW_NOT_FOUND` → return fatal, **no row** (FK to `workflows` makes a row impossible; nothing to bill).
3. **No-row-needed fatal structural checks** (e.g. trigger node present). On failure → write a **terminal `failed` row** (single INSERT, as today) and return. No billing, no reservation.
4. **Create the pre-run row** (`createWorkflowRunStart`) — **NEW**:
   - `id = runId`, `workflow_id`, `user_id`, `trigger_node_id`, `trigger_event`, `started_at = now()`, `steps = []`.
   - `status = 'running'` (new non-terminal state — see §5), `finished_at = NULL` (must become nullable — see §5).
   - `is_test`, `triggered_by`.
   - `estimated_task_cost` + `task_cost_policy_version` populated now (both known pre-execution); `actual_task_cost = NULL`.
   - `billing_status = NULL` (no reservation yet).
   - **Duplicate-dispatch guard:** INSERT keyed on `runId`; a PK conflict means a row already exists for this `runId` → treat as duplicate/replay and **do not double-execute** (see §7).
5. **Billing (flag-selected):**
   - **Flat mode (authoritative today + 15C):** `deduct_tasks_if_available` (unchanged real mutation). Refused → `markWorkflowRunFailedBeforeExecution` (UPDATE row → `failed`, `fatal_error = BILLING_EXHAUSTED`, `finished_at`) → return.
   - *(reserve mode only)* `reserve_tasks_if_available(runId, estimate, expiresAt)`. The RPC stamps `billing_status='reserved'` + `reserved_task_cost` on the row. `ok:false` → the RPC already set `billing_status='failed'`; caller UPDATEs run `status='failed'` + returns. Set `reservation_expires_at` so the sweep can reclaim an orphan.
6. **Execute nodes** (unchanged engine traversal; reserve-mode runs execute *within* the hold).
7. **Compute actual usage** (`computeRunTaskUsage`, unchanged, pure).
8. **Finalize** (`finalizeWorkflowRun`) — **UPDATE the existing row** (NOT insert): `status` → `succeeded`/`failed`, `steps`, `fatal_error`, `error_classification`, `finished_at = now()`, `actual_task_cost`. Then `recordRunActuals` (ledger, unchanged, keyed on `runId`).
9. *(reserve mode only)* **Settle the hold:** on success/partial → `reconcile_task_reservation(runId, actual)` (charge `min(actual, reserved)`, refund the rest). On fatal/cancel before/at execution, or crash before finalize → `release_task_reservation(runId)` (or leave to the expiry sweep).
10. **Shadow mode (unchanged)** + **`task_usage_events` (unchanged)** — both already key on `runId`; the pre-run row does not change them (see §9).

**Fail-open vs fail-closed:**
- **Flat mode:** row create/finalize stay **fail-open** (a persistence hiccup must never break execution — today's contract). Flat deduction stays authoritative and atomic.
- **Reserve mode:** the **reserve step is fail-closed** (no hold → do not execute billable side effects; surface `BILLING_EXHAUSTED`). Reconcile/release are best-effort with the **expiry sweep as the backstop** (an un-reconciled hold self-heals). The pre-run-row INSERT is fail-closed *for reserve mode only* (no row → reserve is impossible → abort), but fail-open for flat mode.

---

## 5. Schema compatibility

Audited [`20260507000001_workflow_runs.sql`](../../../supabase/migrations/20260507000001_workflow_runs.sql), [`20260523000000_workflow_runs_test_mode.sql`](../../../supabase/migrations/20260523000000_workflow_runs_test_mode.sql), [`20260525000000_task_usage_events.sql`](../../../supabase/migrations/20260525000000_task_usage_events.sql) (cost columns), [`20260525000002_reserve_reconcile_billing.sql`](../../../supabase/migrations/20260525000002_reserve_reconcile_billing.sql) (reserve/reconcile columns), and [`repositories/workflowRuns.ts`](../../../repositories/workflowRuns.ts).

**Current columns:** `id` (PK, default uuid), `workflow_id` (FK→workflows, NOT NULL), `user_id` (FK→auth.users, NOT NULL), `status` (**ENUM `workflow_run_status` = {succeeded, failed}**, NOT NULL, **no default**), `trigger_node_id` (NOT NULL), `trigger_event` (jsonb NOT NULL), `steps` (jsonb NOT NULL DEFAULT `[]`), `fatal_error` (jsonb null), `error_classification` (jsonb null), `started_at` (**NOT NULL**), `finished_at` (**NOT NULL**), `created_at` (default now), `is_test` (NOT NULL default false), `triggered_by` (NOT NULL default 'unknown', CHECK enum), `estimated_task_cost`/`actual_task_cost`/`task_cost_policy_version` (nullable), `reserved_task_cost`/`reconciled_task_cost` (nullable), `billing_status` (nullable, CHECK `NULL | reserved | reconciled | released | failed`), `reservation_id`/`reservation_expires_at`/`billing_reconciled_at` (nullable), `error_notifications_sent_at` (nullable).

**Two structural blockers to a pre-run row:**
1. **`status` has no non-terminal value.** The enum is terminal-only ({succeeded, failed}); a row created at start has no legal "in progress" status. **Required change:** add a non-terminal value. Primary recommendation — `ALTER TYPE public.workflow_run_status ADD VALUE 'running'` (and consider `'canceled'` for future explicit cancellation). *Caveat:* `ALTER TYPE … ADD VALUE` cannot run inside the same transaction that then uses the value, and (older PG) is not transactional — do it in its **own migration**, before any code uses it. The partial index `WHERE status='failed'` is unaffected; the failed-runs cron is unaffected.
   - *Alternative considered:* keep `status` terminal and add a separate nullable `run_phase text CHECK (pending|running|succeeded|failed|canceled)` set at start, leaving `status` NULL until finalize. Rejected as primary because it (a) requires making `status` nullable anyway and (b) splits run-state across two columns. Extending the enum is the smaller, clearer change.
2. **`finished_at` is NOT NULL.** A pre-run row has no finish time. **Required change:** `ALTER TABLE workflow_runs ALTER COLUMN finished_at DROP NOT NULL`. Finalize sets it. (Optionally backfill semantics: a non-null `finished_at` ⇔ terminal row.)

**Can a partial row be inserted today?** No — `status` (NOT NULL, no non-terminal value) and `finished_at` (NOT NULL) both block it. After the two changes above, yes.

**Does `recordRun` insert only final rows?** Yes — it is INSERT-only and assumes terminal data. A pre-run model needs **create-at-start (INSERT) + finalize (UPDATE)**, so `recordRun` is split/renamed (see §6). No CHECK currently ties `status` to `finished_at`; if desired, a future CHECK (`status IN ('succeeded','failed') ⇒ finished_at IS NOT NULL`) can enforce the invariant, but is optional.

**Is `testMode` stored?** Yes — `is_test boolean`. No change needed.

**Net required schema changes (COST-15B):** (1) add `'running'` (and optionally `'canceled'`) to `workflow_run_status`; (2) `finished_at` → nullable. Everything reserve/reconcile needs (`billing_status`, `reserved_task_cost`, `reservation_id`, `reservation_expires_at`, `reconciled_task_cost`, `billing_reconciled_at`) **already exists** from COST-12. No new billing columns required.

---

## 6. Repository / API changes needed (design only — not implemented)

In [`repositories/workflowRuns.ts`](../../../repositories/workflowRuns.ts), replace the single `recordRun` INSERT with a create+update pair, all service-role (engine has no user session), all keyed on `runId`:

- **`createWorkflowRunStart(input)`** — INSERT the pre-run row (`status='running'`, `finished_at=null`, `estimated_task_cost`, `task_cost_policy_version`, `is_test`, `triggered_by`, trigger fields). Returns `{ created: boolean }`; a PK conflict resolves to `created:false` (duplicate-dispatch guard) rather than throwing.
- **`finalizeWorkflowRun(input)`** — UPDATE the existing row by `id`: terminal `status`, `steps`, `fatal_error`, `error_classification`, `finished_at`, `actual_task_cost`. Must affect exactly one row (0 rows ⇒ log; defensively may upsert in flat mode to preserve today's fail-open behavior during the 15C transition).
- **`markWorkflowRunFailedBeforeExecution(input)`** — UPDATE → `status='failed'`, `fatal_error`, `error_classification`, `finished_at`. For BILLING_EXHAUSTED / pre-execution fatals that occur **after** the row exists.
- **`getWorkflowRunForBilling(runId)`** — read `billing_status`, `reserved_task_cost`, `reconciled_task_cost`, `status` for engine/settlement decisions and tests (service-role).
- **(billing wrappers already exist)** — `updateWorkflowRunBillingReservation` / `markWorkflowRunBillingReleased` are **not** new repo functions: the COST-12 RPCs (`reserve_tasks_if_available`, `reconcile_task_reservation`, `release_task_reservation`, surfaced via [`repositories/userBilling.ts`](../../../repositories/userBilling.ts) wrappers) **own** every `billing_status`/reservation mutation. The engine must call those — it must NOT write `billing_status` directly (keeps the RPC the single authoritative billing-state mutator, per COST-12).

`recordRun` is removed once all call sites migrate; during 15C it can be retained as a thin `createWorkflowRunStart` + `finalizeWorkflowRun` shim to keep diffs small.

---

## 7. Failure handling

| Scenario | Behavior |
|---|---|
| **Fatal before row creation** (`WORKFLOW_NOT_FOUND`) | Return fatal; **no row** (FK-impossible); no billing. Unchanged. |
| **Fatal after row created, before reservation** (e.g. structural issue surfaced post-create) | `markWorkflowRunFailedBeforeExecution` → terminal `failed`; *(reserve mode)* nothing reserved yet, so nothing to release. |
| **Reservation failure** (`insufficient_tasks`) | Reserve RPC sets `billing_status='failed'` on the row; caller marks run `status='failed'`, `fatal_error=BILLING_EXHAUSTED`, finalizes, returns. **No execution.** (Flat-mode analog: `deduct` refused → same terminal path.) |
| **Failure after reservation, before execution** | `release_task_reservation(runId)` (full refund) → finalize `failed`. |
| **Partial execution failure** (some billable nodes succeeded) | Finalize `failed` with `actual_task_cost` = successful billable sum; *(reserve mode)* `reconcile_task_reservation(runId, actual)` charges the succeeded portion, refunds the rest (COST-11 partial-bill rule). |
| **Engine crash after reservation, before reconcile** | Row stays `billing_status='reserved'` with `reservation_expires_at`; **`release_expired_reservations` sweep** reclaims the hold. Run row may stay `status='running'` until a future "stale running run" sweep finalizes it (call out as a follow-up; not blocking COST-15D). |
| **Engine crash before finalization** (flat mode) | Flat charge already taken (today's behavior); run row left `running` → stale-run sweep finalizes. No reservation involved. |
| **Duplicate / retry with same `runId`** | `createWorkflowRunStart` PK-conflict ⇒ `created:false` ⇒ **abort without re-executing** (idempotent dispatch guard — strictly safer than today, where a duplicate `runId` re-executes and the finalize INSERT silently fails). True retries continue to use a **fresh `runId`** (COST-14E confirmed retries are new runs), getting their own reserve/reconcile cycle. |
| **Test mode** | Create the pre-run row with `is_test=true` (so the row exists for history), **skip all billing** (flat skip today; reserve never engaged in test mode), `usage=null`, **no shadow row, no ledger**. Finalize as today. |

Idempotency anchors: run-row PK (`runId`) guards dispatch; reserve/reconcile/release are each idempotent on `billing_status`; `task_usage_events` partial-unique indexes guard ledger dupes; `billing_shadow_comparisons` UNIQUE(`workflow_run_id`) guards shadow dupes.

---

## 8. Interaction with current flat billing

- **Flat path keeps working unchanged in behavior.** The only mechanical change is *when* the row is written (start + finalize-update instead of finalize-insert). `deduct_tasks_if_available` stays the **authoritative, atomic** flat charge through 15C and remains the rollback fallback until COST-17.
- **Pre-run row can exist before reserve/reconcile live mode.** COST-15C lands create-at-start + finalize-update **in flat mode only** (no reserve calls), so the lifecycle change is validated independently of any live-billing switch — de-risking 15D.
- **No mislabeling.** Flat-billed runs leave `billing_status = NULL` (never `reserved`/`reconciled`). Reserve/reconcile runs carry the explicit billing_status states. Analytics segment on `billing_status IS NULL` (flat) vs set (reserve/reconcile), exactly as COST-11 §14 specifies.
- **Old finalized-only rows remain valid** — terminal `status`, non-null `finished_at`, `billing_status NULL`. The `finished_at`-nullable change is backward-compatible (existing rows are non-null).

---

## 9. Interaction with task ledgers and shadow comparisons

- **`task_usage_events`** already references `workflow_run_id` (FK→workflow_runs, `ON DELETE CASCADE`) and is written at finalize via `recordRunActuals`. With a pre-run row, the FK target now exists *earlier* — strictly fine; the ledger still writes once at finalize, keyed on the same `runId`. Partial-unique idempotency indexes are unchanged.
- **`billing_shadow_comparisons`** already keys on `workflow_run_id` with `UNIQUE(workflow_run_id)` and **no FK** to the run (decoupled by design, COST-14C). The pre-run row does not change shadow at all — shadow is still computed once, post-run, from final data, and upserts idempotently.
- **No duplicate shadow / ledger rows.** Shadow stays gated on `usage && shadowFlag` after the loop (one upsert per `runId`); the ledger stays one write per `runId`. Creating the run row earlier touches neither.
- **Actual-usage recording updates the existing run row, not a new one.** This is the key change: `finalizeWorkflowRun` **UPDATEs** `actual_task_cost` on the row created at start (today it INSERTs). No second row is ever created for the same `runId`.

---

## 10. Test strategy (for the future implementation, COST-15B/C/D)

Mirror `tests/unit/repositories/` + `tests/unit/services/execution/` patterns; add a gated DB-integration harness like COST-14E for the real run-row lifecycle.

- **Pre-run row created once** — `createWorkflowRunStart` inserts exactly one row; second call with same `runId` ⇒ `created:false`, still one row.
- **Finalize updates the same row** — after a real run, exactly one `workflow_runs` row for the `runId`, terminal status, `finished_at` set, `actual_task_cost` populated; no duplicate.
- **Fatal pre-check behavior** — `WORKFLOW_NOT_FOUND` → no row; `TRIGGER_NODE_NOT_FOUND` → one terminal `failed` row.
- **Reservation failure updates the row** — `billing_status='failed'`, run `status='failed'`, no execution, no side effects (reserve-mode tests).
- **Release / reconcile update the row** — reconcile → `billing_status='reconciled'`, `reconciled_task_cost` correct; release → `billing_status='released'`; both idempotent on re-call.
- **Flat mode unchanged** — flat run produces a terminal row with `billing_status NULL`, `tasks_used` moved by exactly the flat 1/run; behavior byte-compatible with pre-15C aside from the create-at-start timing.
- **Shadow mode unchanged** — one shadow row per real run; none for test runs (regression guard on COST-14/14E).
- **Test mode** — pre-run row with `is_test=true`, zero billing, zero ledger, zero shadow.
- **Idempotency / retry** — duplicate `runId` does not double-execute; a fresh-`runId` retry gets its own reserve/reconcile cycle.
- **No duplicate `workflow_runs` rows for the same `runId`** — explicit assertion across all paths.
- **Crash recovery** — a `reserved` row past `reservation_expires_at` is reclaimed by `release_expired_reservations`; a stale `running` row is identified for finalization (follow-up sweep).

---

## 11. Recommended implementation slices

The prompt's proposed sequence is sound; affirmed with one refinement (land the run-row lifecycle in flat mode *before* any live reserve):

- **COST-15A — design only** *(this slice).* No code/schema change.
- **COST-15B — schema + repository support.** Migration: add `'running'` (+ optional `'canceled'`) to `workflow_run_status`; make `finished_at` nullable. Repo: `createWorkflowRunStart`, `finalizeWorkflowRun`, `markWorkflowRunFailedBeforeExecution`, `getWorkflowRunForBilling` (+ unit tests). **No engine wiring.** Apply the migration to the dev DB + a verify harness (COST-14D/14E pattern).
- **COST-15C — engine pre-run-row integration, flat authoritative + shadow-safe.** Switch the engine to create-at-start + finalize-update **in flat mode** (no reserve calls). Flat billing stays authoritative; shadow unchanged; duplicate-dispatch guard active. Validates the lifecycle in production-shaped runs with **zero live-billing change**.
- **COST-15D — reserve/reconcile live mode, internal allowlist.** Behind `ENABLE_RESERVE_RECONCILE_BILLING` + a per-user allowlist: reserve(estimate) before execution → reconcile/release after. Flat remains the path/fallback for everyone else.
- **COST-15E — organic internal shadow/live comparison review.** Collect organic shadow data over time (COST-14E tooling) + compare to live reconciled charges for allowlisted users; gate COST-16 on it.
- *(Add)* **COST-15F — stale-`running`-run sweep** (finalize rows left `running` by a crash), complementary to the existing `release_expired_reservations` hold sweep. Small, can fold into 15C if cheap.

---

## 12. Acceptance criteria

This design is acceptable because it:
- **Does not change live billing.** Flat `deduct_tasks_if_available` stays authoritative; this slice ships no code/schema/migration.
- **Identifies exactly what must change before real reservations:** add a non-terminal `workflow_run_status` value + make `finished_at` nullable (schema); split `recordRun` into create-at-start / finalize-update + add the pre-run/fatal/billing-read repo helpers (repository); keep the COST-12 RPCs as the sole billing-state mutator.
- **Preserves flat billing and shadow-mode behavior** — flat runs stay `billing_status NULL`; shadow stays a once-per-run, finalize-time, decoupled upsert; ledger keying is unchanged.
- **Prevents reservations without a durable run row** — Option A/E creates the row before the first balance touch; reserve is fail-closed and the RPC already refuses (`run_not_found`) without one.
- **Has clear failure + idempotency handling** — §7: every fatal/crash/retry/test path defined; run-PK + RPC-state + ledger/shadow unique indexes + expiry sweep provide layered idempotency.
- **Keeps AI / templates / custom nodes paused / out of scope** — none are referenced or required by this lifecycle.

**This document changes nothing at runtime.** It is the settled design COST-15B+ implement against.
