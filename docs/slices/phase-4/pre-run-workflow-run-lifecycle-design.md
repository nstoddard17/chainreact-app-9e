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
