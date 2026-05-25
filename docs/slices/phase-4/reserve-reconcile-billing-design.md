# Phase 4 — Reserve/Reconcile Billing Design

**Slice:** 4.COST-11
**Type:** Design/doc only. **No runtime / source / test / migration files modified.** No live billing change.
**Date:** 2026-05-25
**Branch:** `v2-ai-architecture-planning`
**HEAD at authoring:** `6d306c5d6` (COST-8 — billing/tasks foundation closeout)
**Companions:** [`task-cost-billing-model-audit.md`](./task-cost-billing-model-audit.md) (COST-1 audit) · [`task-cost-billing-foundation-closeout.md`](./task-cost-billing-foundation-closeout.md) (COST-8 closeout)

> Purpose: a detailed, implementation-ready design for replacing the flat 1-task-per-run charge with a fair **reserve → execute → reconcile** model built on the existing estimator + ledger foundation. **This doc does not change live billing.** It specifies the schema, RPCs, event flow, integration points, rollout, risks, and tests, and lists the decisions Marcus must approve before any code lands.

---

## Implementation status

| Slice | Status | Notes |
|---|---|---|
| **COST-11** | shipped (`6d7e46a1f`) | This design (doc-only). |
| **COST-12** | shipped | DB foundation: `user_billing.tasks_reserved`, `workflow_runs` reservation/reconcile columns + `billing_status` CHECK, `task_usage_events` partial-unique idempotency indexes, and the four atomic RPCs (`reserve_tasks_if_available`, `reconcile_task_reservation`, `release_task_reservation`, `release_expired_reservations`) + thin `userBilling` repo wrappers. **No engine wiring, no live-billing change, flat `deduct_tasks_if_available` left intact.** See note below. |
| **COST-12B** | shipped | Real-DB RPC integration harness (`scripts/verify-reserve-reconcile-rpcs.mjs`) proving the COST-12 RPCs/constraints against an actual Postgres/Supabase. Opt-in + triple-guarded; skips without env. No RPC logic changed. See note below. |
| **COST-12C** | shipped | Migration applied to the confirmed dev/test DB; harness executed **green (64/64 assertions, 0 failures)** across all 15 cases. No bug found, no code change. Cleanup verified (0 leftover users/workflows). **COST-13 unblocked.** See note below. |
| **COST-13** | shipped | Typed reserve/reconcile service layer (`reserveReconcileBilling.ts`) over the COST-12 repo wrappers, behind `ENABLE_RESERVE_RECONCILE_BILLING` (default off). **Engine NOT wired; live billing unchanged.** See note below. |
| **COST-14** | shipped | Engine **shadow mode** (`reserveReconcileShadowMode.ts` + engine wiring) behind `ENABLE_RESERVE_RECONCILE_SHADOW` (default off). Computes + LOGS flat-vs-proposed comparison post-run; **no balance mutation, no reserve/reconcile RPC calls, flat gate authoritative**. See note below. |
| **COST-14B** | shipped | Pure shadow-metrics aggregator (`reserveReconcileShadowStats.ts`) — folds shadow comparisons into cutover-decision stats. No DB/table (logs are console-only); ingestion documented as offline/future. See note below. |
| **COST-14C** | shipped | Persisted shadow ledger `billing_shadow_comparisons` (separate from actual ledgers) + repo + recorder/stats service. Engine writes one row per real run when shadow flag is on (fail-open). Owner analytics aggregate via COST-14B. See note below. |
| **COST-14D** | shipped | COST-14C migration **applied to the dev DB**; persistence **smoke-verified green (11/11)** against real Supabase (`verify-billing-shadow-comparisons.mjs`). Dev shadow-data collection unblocked. See note below. |
| **COST-14E** | shipped | Dev shadow **data collection + review**: a gated integration harness drives the REAL engine over 8 representative workflows against the dev DB (shadow flag on, dev only) → **8 shadow rows**, folded through the REAL COST-14B aggregator (`getReserveReconcileShadowStats`). Idempotency, test-mode-no-row, flat-billing-only-mutation, and 0-residue cleanup all verified. Sample data is internally consistent. See note below. |
| **COST-15A** | shipped | Design/audit of the pre-run `workflow_runs` row lifecycle ([pre-run-workflow-run-lifecycle-design.md](./pre-run-workflow-run-lifecycle-design.md)) — why live reserve needs a durable row before side effects; recommended create-at-start + finalize-update lifecycle; schema/repo/failure plan. Doc only. |
| **COST-15B** | shipped | Schema + repository foundation: migration adds `'running'` to `workflow_run_status` + makes `finished_at` nullable (applied to dev DB, verified); repo gains `createWorkflowRunStart` / `finalizeWorkflowRun` / `markWorkflowRunFailedBeforeExecution` / `getWorkflowRunForBilling`. **Engine NOT wired; live billing unchanged; `recordRun` compatibility preserved.** See [pre-run-workflow-run-lifecycle-design.md](./pre-run-workflow-run-lifecycle-design.md) COST-15B note. |
| COST-15C | future (next) | Wire the engine to create-at-start + finalize-update **in flat mode** (flat billing authoritative, shadow unchanged) — validates the lifecycle with zero live-billing change. |
| COST-15D | future (needs MORE representative shadow data) | Internal users (live reserve/reconcile for an allowlist) — reserve(estimate) before side effects → reconcile/release; gate on aggregated shadow data. |
| COST-16 | future | Production cutover. |
| COST-17 | future | Flat-gate cleanup. |

### COST-12 implementation note

**Schema/RPC FOUNDATION only — nothing calls these yet.** Migration [`20260525000002_reserve_reconcile_billing.sql`](../../../supabase/migrations/20260525000002_reserve_reconcile_billing.sql):

- **`user_billing.tasks_reserved int NOT NULL DEFAULT 0`** + `CHECK (>= 0)`. `available = tasks_limit − tasks_used − tasks_reserved`. The `used + reserved <= limit` invariant is enforced by the reserve RPC predicate (a real counter is required so the check is atomic under the row lock; ledger sums cannot prevent concurrent overspend). Existing users default to 0 — flat billing keeps working.
- **`workflow_runs`** adds nullable `reserved_task_cost`, `reconciled_task_cost`, `billing_status` (CHECK `NULL | reserved | reconciled | released | failed`), `reservation_id`, `reservation_expires_at`, `billing_reconciled_at` + a partial sweep index. Existing/flat rows stay NULL and are NOT reinterpreted as reserve/reconcile billed. No backfill.
- **`task_usage_events` idempotency:** two **partial** unique indexes — run-level `(user_id, workflow_run_id, event_type) WHERE node_id IS NULL` and node-level `(user_id, workflow_run_id, node_id, event_type) WHERE node_id IS NOT NULL`, both requiring `workflow_run_id IS NOT NULL`. Future `internal_poll_*` events lacking a run id are deliberately unconstrained (no natural key yet). Existing rows are already unique under these keys.
- **RPCs** (all `SECURITY DEFINER`, `search_path = public`, `REVOKE` from public/anon/authenticated, `GRANT EXECUTE` to `service_role` — same posture as `deduct_tasks_if_available`, which is **left untouched** as the rollout fallback):
  - `reserve_tasks_if_available(p_user_id, p_amount, p_run_id, p_expires_at?)` — atomic capacity hold; predicate `tasks_used + tasks_reserved + p_amount <= tasks_limit`; idempotent on `billing_status`; `p_amount = 0` reserves without a balance write; insufficient → marks run `failed`, `ok:false`.
  - `reconcile_task_reservation(p_user_id, p_run_id, p_actual)` — `charge = least(actual, reserved)`, `refund = reserved − charge`; `tasks_used += charge`, `tasks_reserved -= reserved` (clamped `>= 0`); idempotent on `reconciled`; over-reserve clamped + `reason: reconcile_over_reserve`.
  - `release_task_reservation(p_user_id, p_run_id)` — full release without charge; idempotent.
  - `release_expired_reservations(p_now?)` — sweep `reserved` holds past expiry; idempotent; cron/service-intended.
- **Caller contract:** a reservation **is** the run — RPCs mutate `workflow_runs` keyed by run id, so the caller (COST-14) MUST ensure the run row exists before reserving (today the engine writes it at finalize; creating it at reserve time is a documented COST-14 prerequisite).
- **Period reset:** none exists in the DB today; a future reset job MUST also zero `tasks_reserved` / rely on the expiry sweep (documented in the migration header).
- **Repo wrappers** added to [`repositories/userBilling.ts`](../../../repositories/userBilling.ts): `reserveTasks`, `reconcileReservation`, `releaseReservation`, `releaseExpiredReservations` — thin pass-throughs (RPC is the authoritative mutator; no read-then-write). Unit tests in [`userBilling.test.ts`](../../../tests/unit/repositories/userBilling.test.ts) cover wrapper mapping + error propagation. **RPC behavior** (atomicity, idempotency, clamping, non-negativity) requires a live-DB/pgTAP harness the repo does not have yet — deferred to that harness per §17.
- **Unchanged:** no engine integration, no service layer, no feature flag, no live-billing change, no UI, AI paused.

### COST-12B implementation note

**Real-DB RPC integration harness — proves COST-12 behaves against an actual database (the jest suite only mocks the repo wrappers).** No RPC logic changed (no bug found). Harness: [`scripts/verify-reserve-reconcile-rpcs.mjs`](../../../scripts/verify-reserve-reconcile-rpcs.mjs); convenience script `npm run verify:reserve-reconcile`.

**What it verifies (15-case matrix):** reserve success / insufficient / amount-0 / idempotent; reconcile exact / under / over-reserve-clamp / idempotent; release / release-idempotent; expiry sweep (releases expired, leaves active, no-op on re-run); non-negativity invariants; service-role-only grants (anon execution rejected, when an anon key is provided); `task_usage_events` partial unique indexes (run-level + node-level dup rejected, different `node_id` allowed, runless poll events not blocked); and that flat `deduct_tasks_if_available` still works.

**How it runs:** uses `@supabase/supabase-js` with the service-role key to seed isolated throwaway auth users (`@chainreact-rpc-harness.invalid`) + workflows + runs, asserts RPC effects on the real counters/columns, then **cleans up via `auth.admin.deleteUser` (cascade)**. Deterministic; resets billing per scenario. Prints a pass/fail summary and exits non-zero on any failure.

**Safety (triple-guarded — never runs in CI / never accidental):**
1. `ALLOW_DB_INTEGRATION_TESTS=true` must be set explicitly (DESTRUCTIVE: creates/deletes auth users).
2. `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` must be present.
3. It is a standalone script — NOT part of `npm test`, so it can never run in the normal jest/CI path.
Missing any guard → it **skips with exit 0** and prints the exact run command. `NEXT_PUBLIC_SUPABASE_ANON_KEY` (optional) enables the grant-rejection check. The COST-12 migration must be applied to the target DB first.

**Run command:** `ALLOW_DB_INTEGRATION_TESTS=true node --env-file=.env.local scripts/verify-reserve-reconcile-rpcs.mjs` (PowerShell: `$env:ALLOW_DB_INTEGRATION_TESTS="true"; node --env-file=.env.local scripts/verify-reserve-reconcile-rpcs.mjs`).

**Why required:** reserve/reconcile correctness depends on real DB semantics — row-level locking, atomic UPDATE predicates, CHECK constraints, partial unique indexes, idempotent state transitions, expiry release — none of which jest mocks exercise. This harness is the gate for COST-13 (service layer) and COST-14 (shadow-mode engine wiring) confidence.

**Status (updated by COST-12C):** ✅ **executed green.** The COST-12 migration was applied to a confirmed disposable dev/test Supabase project (us-east-1) via `npm run db:push`, and the harness ran with `ALLOW_DB_INTEGRATION_TESTS=true` — **64/64 assertions passed, 0 failures** across all 15 cases (reserve success/insufficient/zero/idempotent, reconcile exact/under/over-clamp/idempotent, release + idempotent, expiry sweep, non-negativity, service-role-only grant rejection, `task_usage_events` partial unique indexes, and the flat `deduct_tasks_if_available` regression). No RPC/migration bug found → no code change. Cleanup verified: 0 leftover harness auth users / workflows (cascade delete). The reserve/reconcile DB foundation is now proven against a real database; **COST-13 is unblocked.**

### COST-13 implementation note

**Typed service layer over the COST-12 RPCs, behind a default-off flag — engine NOT wired, live billing unchanged.** The primitives COST-14 shadow mode will call.

- **Feature flag** [`services/billing/billingFeatureFlags.ts`](../../../services/billing/billingFeatureFlags.ts): `ENABLE_RESERVE_RECONCILE_BILLING` (default **false**), read via `isReserveReconcileEnabled()` at call time. No existing flag module existed; this is the dedicated home. When false, the service mutates **no** balances.
- **Repo wrappers (reused from COST-12, not duplicated):** `reserveTasks` / `reconcileReservation` / `releaseReservation` / `releaseExpiredReservations` in [`repositories/userBilling.ts`](../../../repositories/userBilling.ts) — call the exact RPC names, map snake_case→camelCase, preserve reasons (`already_reserved` / `already_reconciled` / `already_released` / `reconcile_over_reserve` / `insufficient_tasks` / `nothing_to_release` / `run_not_found`), throw on infra error.
- **Service** [`services/billing/reserveReconcileBilling.ts`](../../../services/billing/reserveReconcileBilling.ts): `createBillingReservation`, `reconcileBillingReservation`, `releaseBillingReservation`, `releaseExpiredBillingReservations`, `isReserveReconcileEnabled`. Typed `BillingStatus` (`reserved|reconciled|released|failed|none`) + `BillingReason` (closed union incl. `test_mode` / `disabled` / `zero_reservation` / `rpc_error` / `not_reserved` / `unknown`) + result unions (`ReservationResult` / `ReconcileResult` / `ReleaseResult` / `SweepResult`).
- **Behavior:** `testMode` → skipped (`test_mode`), no RPC. Flag off → skipped (`disabled`), no RPC, no mutation. `estimatedTasks === 0` → explicit idempotent `zero_reservation` (RPC still called with 0 so the run enters the reserved→reconciled lifecycle). Enabled+real → calls the wrapper, maps faithfully (over-reserve reason preserved). Infra/RPC throw → **caught and returned** as `{ ok:false, reason:'rpc_error', error }` so shadow mode can log without execution-breaking throws (operational error surfaced, not hidden). The **expiry sweep is NOT flag-gated** (janitor; safe anytime; a flag rollback can't strand holds).
- **Redaction:** results carry only ids/counts/enums/amounts + an operational error string — no secrets/tokens/configs/Supabase internals (no-leak tested).
- **Unchanged:** engine not wired, `executionBillingGate` live path untouched, flat `deduct_tasks_if_available` intact, no UI, AI paused. Tests: [`reserveReconcileBilling.test.ts`](../../../tests/unit/services/billing/reserveReconcileBilling.test.ts) (flag/test-mode gating, mapping, zero, over-reserve, rpc_error, ungated sweep, no-leak) + the COST-12 wrapper tests. **Next: COST-14 shadow-mode engine integration.**

### COST-14 implementation note

**Shadow mode — the engine now computes + LOGS what reserve/reconcile WOULD have billed vs the flat charge, for comparison only. Live billing is UNCHANGED.** Separate flag from the live one; default off → zero behavior change.

- **Engine lifecycle audit (Part A):** `runId` is generated at the top of `runWorkflow` ([engine.ts](../../../services/execution/engine.ts)), so the run **id** exists pre-execution — but the `workflow_runs` **row** is only written at finalize (`persistRun`); there is no pre-execution row insert. The flat gate runs before the execution loop; `def` / `usage` / `gateOutcome` / `log` are all in scope post-run. **Chosen:** shadow uses only the FINAL run data + a structured log — **no pre-run row creation, no schema change, no balance mutation, no RPC** (the run-row-at-reserve-time prerequisite the COST-11 design notes is for *real* wiring at COST-15, not shadow).
- **Flag** [`billingFeatureFlags.ts`](../../../services/billing/billingFeatureFlags.ts): `ENABLE_RESERVE_RECONCILE_SHADOW` (default false), `isReserveReconcileShadowEnabled()`. Kept distinct from the live `ENABLE_RESERVE_RECONCILE_BILLING` (still off).
- **Comparison service** [`reserveReconcileShadowMode.ts`](../../../services/billing/reserveReconcileShadowMode.ts): `buildReserveReconcileShadowComparison` (pure; re-estimates from the definition + folds in actuals) + `buildShadowFromRun` (maps the gate's post-deduction counters → the pre-flat-charge balance summary, then builds the comparison). Imports ONLY the pure estimator — no `userBilling`/reserve-reconcile import, so a balance-mutating path is structurally unreachable. Output: `{ billingMode:"shadow", status:"computed", workflowId, workflowRunId, flatChargedTasks, estimatedTasksPerRun, actualBillableTasks, proposedReservedTasks, proposedReconciledTasks, proposedRefundedTasks, deltaVsFlat, wouldHaveReserved, wouldHaveHadEnoughBalance, warnings, policyVersion }`.
- **Engine wiring:** after the COST-3 actual-usage recording, when `usage && isReserveReconcileShadowEnabled()`, the engine builds the comparison and `log("execution.run.billing_shadow", {...})`. Wrapped in try/catch → **fail-open** (`execution.run.billing_shadow_failed` logged; the run never breaks). Test runs have `usage===null` → never shadow. `flatChargedTasks = FLAT_TASKS_PER_RUN (1)`.
- **Comparison data location (Part F):** **structured log only** (`execution.run.billing_shadow`) — no schema change, no new migration, no user-facing output. This keeps shadow data out of the real billing analytics.
- **Live billing untouched (Part E, tested):** `executionBillingGate` still called (`{ testMode:false }` real / `true` test); the flat `deductTasks` path is unchanged; reserve/reconcile RPC wrappers (`reserveTasks`/`reconcileReservation`/`releaseReservation`) are asserted **never called**; COST-3 actual recording still fires.
- **Unchanged:** flat gate authoritative, no live reserve/reconcile, no UI, AI paused. Tests: [`reserveReconcileShadowMode.test.ts`](../../../tests/unit/services/billing/reserveReconcileShadowMode.test.ts) (delta math, clamp, warnings, balance mapping, no-leak) + COST-14 block in [`engine.test.ts`](../../../tests/unit/services/execution/engine.test.ts) (flag off/on, no-RPC guard, fail-open, test-mode, COST-3 intact). **Next: COST-15 internal-user live reserve/reconcile (requires creating the `workflow_runs` row at reserve time).**

### COST-14B implementation note

**Shadow metrics aggregation — a PURE aggregator so the COST-15 cutover decision is made from aggregate shadow data, not raw logs. No DB, no table, no UI, live billing unchanged.**

- **Logging/metrics audit (Part A):** the engine's `log` is a local `console.info(JSON.stringify(...))` — shadow events (`execution.run.billing_shadow`) go to **stdout only; they are NOT persisted or in-app queryable**. No logger module, no log-ingestion path, no `billing_shadow` table. The actual-billing ledgers (`task_usage_events` / `ai_cost_events`) must stay actual-only — storing hypothetical shadow billing there would corrupt billing analytics.
- **Chosen approach — Option A (pure aggregator), table deferred.** [`services/analytics/reserveReconcileShadowStats.ts`](../../../services/analytics/reserveReconcileShadowStats.ts) folds an array of `ReserveReconcileShadowComparison` objects into stats. No migration, no overbuild, reversible. A persisted `billing_shadow_comparisons` table is the **future option (COST-14C)** — added only if log export proves impractical / routine in-app aggregation is needed (and never in `task_usage_events`).
- **Production ingestion (documented, not built):** export the `execution.run.billing_shadow` log lines, JSON-parse each payload into a comparison, and fold via this aggregator (offline / one-off analysis script). That is how shadow data gets evaluated before COST-15.
- **APIs:** `summarizeShadowComparisons` (total, flat vs proposed totals, total/avg delta, higher/lower/same counts, estimated vs actual variance, refunds total, insufficient-balance count, warning-code breakdown, policy-version breakdown), `groupShadowByWorkflow`, `getShadowDeltaStats` (+ top positive/negative-delta workflows), `getShadowInsufficientBalanceStats` (+ recurring-affected workflows).
- **Redaction:** comparisons carry only ids/counts/enums/warning codes (the estimator never reads config); the aggregator reads ONLY warning `code` (never `message`), so even a tainted message can't leak into an aggregate (no-leak tested).
- **Unchanged:** no live billing, no balance mutation, no reserve/reconcile RPC wiring, no UI, no owner route. Tests: [`reserveReconcileShadowStats.test.ts`](../../../tests/unit/services/analytics/reserveReconcileShadowStats.test.ts). **Next: gather shadow data, then COST-15.**

### COST-14C implementation note

**Persisted shadow ledger — gives the COST-14B aggregator a durable, in-app source so the COST-15 cutover decision uses queryable data, not stdout logs. Shadow-only; no live billing change, no balance mutation, no reserve/reconcile RPC.**

- **Table** [`20260525000003_billing_shadow_comparisons.sql`](../../../supabase/migrations/20260525000003_billing_shadow_comparisons.sql): `billing_shadow_comparisons` — **separate** from `task_usage_events` / `ai_cost_events` (actual ledgers must never hold hypothetical billing). Columns: `user_id` (FK CASCADE); `workflow_id` / `workflow_run_id` (uuid, **no FK** — decoupled correlation keys so persistence doesn't depend on run/workflow-row write success); the scalar comparison fields (flat/estimated/actual/reserved/reconciled/refunded/delta + `would_have_reserved` + nullable `would_have_had_enough_balance`); `warning_codes text[]` (CODES only, never messages); `policy_version`; `billing_mode` (CHECK `= 'shadow'`); `created_at`. **UNIQUE (workflow_run_id)** = one comparison per run (idempotency anchor). Indexes: user / workflow / created_at / delta + partial index on the insufficient-balance case. RLS enabled + `select_own` policy + least-privilege grants (authenticated SELECT, service_role full).
- **Repository** [`billingShadowComparisons.ts`](../../../repositories/billingShadowComparisons.ts): `insertComparison` (service-role **upsert** on `workflow_run_id` with `ignoreDuplicates` → **idempotent**), `listForRange({from,to,userId?,workflowId?,limit?})` + `listForWorkflow` (owner/admin service-role range reads). snake_case ↔ camelCase.
- **Service** [`billingShadowComparisons.ts`](../../../services/billing/billingShadowComparisons.ts): `recordBillingShadowComparison(comparison, userId)` (maps comparison → insert, persisting warning **codes** only); `getReserveReconcileShadowStats({from,to})` + `getReserveReconcileShadowStatsByWorkflow(...)` load persisted rows, reconstruct comparison-shaped objects (codes → warnings), and fold them through the **COST-14B** aggregator. No API route.
- **Engine wiring:** the COST-14 shadow block now calls `recordShadowComparison` (in [`reserveReconcileShadowMode.ts`](../../../services/billing/reserveReconcileShadowMode.ts)) which builds + logs **and persists** via an **injected** `persist` (= `recordBillingShadowComparison`) + injected `log`. The shadow module still imports ONLY the pure estimator (the persistence service is injected, not imported), so a balance-mutating path stays structurally unreachable. **Fail-open at every layer:** build error → `execution.run.billing_shadow_failed`; persist error → `execution.run.billing_shadow_persist_failed`; plus an outer `.catch` in the engine — the run never breaks. **Gated ONLY by `ENABLE_RESERVE_RECONCILE_SHADOW`** (never the live flag). Test/dry-run runs (`usage===null`) never persist.
- **Redaction:** only ids/counts/booleans/warning codes/policy version/timestamps persisted; warning **messages** are dropped at the recorder (tested), so no node config / secrets / payloads reach the table.
- **Unchanged:** flat gate authoritative, `executionBillingGate`/`deductTasks` untouched, COST-3 recording intact, no UI, no owner route, AI paused. Tests: [`billingShadowComparisons.test.ts`](../../../tests/unit/repositories/billingShadowComparisons.test.ts) (repo: map, idempotent upsert, range filters, errors) + [`billingShadowComparisons.test.ts`](../../../tests/unit/services/billing/billingShadowComparisons.test.ts) (recorder mapping, persisted aggregation, empty zeros, policy/warning preservation, no-leak) + `recordShadowComparison` orchestration block + engine COST-14C block (persist injected, fail-open, no-RPC, test-mode). **Next: collect/review shadow data, solve the pre-run `workflow_runs` row lifecycle, then COST-15.**

### COST-14D implementation note

**Migration applied to the dev DB + persistence smoke-verified — dev shadow-data collection is now unblocked. Live billing unchanged.**

- **Migration applied:** `20260525000003_billing_shadow_comparisons.sql` pushed to the confirmed disposable dev/test Supabase project (us-east-1, ref `qcepijemjlkssfkvzlio` — the same DB authorized in COST-12C) via `npm run db:push`. It was the only pending migration.
- **Smoke harness** [`scripts/verify-billing-shadow-comparisons.mjs`](../../../scripts/verify-billing-shadow-comparisons.mjs) (`npm run verify:shadow-comparisons`) — opt-in + triple-guarded (`ALLOW_DB_INTEGRATION_TESTS=true` + service-role env; standalone, never in CI; skips with exit 0 otherwise). Creates a throwaway auth user, exercises the COST-14C DB ops, cleans up via user-cascade.
- **Result: 11/11 checks passed, 0 failures** — table exists; service_role insert works; `UNIQUE(workflow_run_id)` upsert is idempotent (first comparison wins, duplicate ignored); range read returns all columns the COST-14B aggregator maps; warning **codes** persist while there is no warning-message column (codes-only by construction); `billing_mode='shadow'`; persisted rows fold to a delta total; cascade cleanup left **0** rows. Post-run check: **0** leftover harness users, **0** rows in the table.
- **Aggregation note:** the smoke verifies the persisted rows carry every column `getReserveReconcileShadowStats` needs and fold correctly; the full aggregator logic stays unit-tested (pure, DB-independent once rows load).
- **Unchanged:** no live billing, no balance mutation, no reserve/reconcile RPC, no UI, no owner route, AI paused. **Shadow persistence is now live on the dev DB** — enabling `ENABLE_RESERVE_RECONCILE_SHADOW` there will start collecting real comparison rows. **COST-15** still requires reviewing enough collected shadow data and creating the `workflow_runs` row at reserve time.

### COST-14E implementation note

**Dev shadow-data collection + review — the engine's shadow path was exercised end-to-end against the dev DB and the persisted rows fold correctly through the canonical aggregator. Live billing unchanged; reserve/reconcile live flag never enabled.**

- **Flag scope:** `ENABLE_RESERVE_RECONCILE_SHADOW=true` set **only in-process for the harness run** (dev DB, ref `qcepijemjlkssfkvzlio`). `ENABLE_RESERVE_RECONCILE_BILLING` was asserted **not** `"true"` and never set. No `.env` committed.
- **Collection method — gated integration harness** [`tests/integration/billing/reserveReconcileShadowCollection.test.ts`](../../../tests/integration/billing/reserveReconcileShadowCollection.test.ts) (opt-in: `ALLOW_DB_INTEGRATION_TESTS=true` + service-role env; self-skips otherwise — safe under plain `npm test`/CI). It drives the **REAL** `WorkflowEngine.runWorkflow` against the dev DB; only the *outside world* is stubbed — the action-handler registry (controllable mock handler, **no provider API ever called**), the discovery registry (deterministic billable/trigger meta; the real `taskCostPolicy` still classifies), `notifyWorkflowFailure` (no-op), and the cookie client. The flat gate/`deduct_tasks_if_available`, COST-3 usage recorder, run-row writer, and COST-14C shadow recorder/repo are all real.
- **Why an engine harness and not a `.mjs`:** the `.mjs` verify-script pattern can't drive the TS engine; ts-jest is the only TS runtime in the repo. A `.mjs` could only re-insert hand-built rows (already covered by COST-14D). COST-14E's value is exercising the **engine→shadow** path on real runs.
- **Runs executed (10 total → 8 shadow rows):** WF1 trigger-only (no billable action), WF2 one provider action, WF3 three actions under a webhook trigger, WF4 native control-flow (delay+transform, free) + provider action, WF5 `native:http_request` (billable via override; mocked, no egress), WF6 branching where only one router path runs (actual < estimate), WF7 partial failure (succeeds then throws mid-run), WF8 insufficient-balance on a tight-quota user. Plus an **idempotency re-run** (WF2's run id reused → no second row) and a **test-mode run** (→ no row). Each non-test real run wrote exactly one row.
- **Aggregate (via the REAL `getReserveReconcileShadowStats`):** `total 8`, `flatTotalCharged 8`, `proposedTotalCharged 11`, `totalDelta +3`, `averageDelta 0.375`, higher/lower/same = `2/1/5`, `totalEstimatedTasks 14`, `totalActualBillableTasks 11`, `estimateVsActualVariance 3`, `proposedRefundsTotal 3`, `insufficientBalanceCount 1`; `byWarningCode {BRANCHING_UPPER_BOUND:1, EVENT_VOLUME_UNKNOWN:1}`; `byPolicyVersion {v1:8}`. Top positive-delta: the 3-action and insufficient-balance flows (+2 each); top negative-delta: the trigger-only flow (−1). The numbers are internally consistent: proposed reconciles to actual (`proposedTotal == totalActual == 11`), `delta == proposed − flat`, and refunds (`3`) == over-estimation from branching (WF6, +1) + partial failure (WF7, +2).
- **Safety proofs (asserted by the harness):** flat billing was the **only** real balance mutation — `user_billing.tasks_used` moved exactly as the flat 1/run gate dictates (user1 `0→8`, user2 `4→5`) while `tasks_reserved` stayed **0** on both (shadow never reserves). Re-running with a reused run id left exactly one row (first comparison wins). A test-mode run produced **no** row and **no** deduction. Cleanup left **0** harness rows / **0** harness users (explicit deletes + user-cascade).
- **Review tooling:** ad-hoc owner/ops CLI [`scripts/review-reserve-reconcile-shadow-data.mjs`](../../../scripts/review-reserve-reconcile-shadow-data.mjs) (`npm run review:shadow-comparisons`, read-only, `--from/--to/--limit/--top`) prints the same summary for whatever is in a range. Its fold **mirrors** the canonical COST-14B aggregator (a `.mjs` can't import the TS module — same precedent as the verify script mirroring the repo); the harness exercises the canonical aggregator itself.
- **Evaluation (COST-15 gate):** shadow collection **works** and the **sample data is internally consistent** with no unexpected deltas, no missing rows, and no balance mutation from the shadow path. This is **synthetic harness data** (mock handlers, ~one run per shape), not organic usage — so it proves the *pipeline and the cost math*, not real-world distribution. **Internal-user live reserve/reconcile (COST-15) may be considered only after more representative data is collected** — ideally from organic dev/internal usage over time with `ENABLE_RESERVE_RECONCILE_SHADOW` on — **and** after the outstanding **`workflow_runs`-row-at-reserve-time** design lands (reservations key on the run row, which today is written at finalize). Do **not** read this as "ready for production."
- **Unchanged:** no live billing switch, no balance-mutating reserve/reconcile RPC from the engine, no UI, no owner route, AI paused.

---

## 1. Executive summary

**Recommendation: do NOT flip live billing directly from flat 1/run to per-node actual charges.** A naive "deduct after each successful node" model double-charges on retries, races concurrent runs into negative balance, and can perform external side effects the user can't pay for. Instead, adopt a **reserve → execute → reconcile** pipeline that reuses everything COST-1..7 already built.

The model in one line: **before a run, atomically reserve the estimator's upper-bound cost; during the run, account each successful billable node against that reservation; after the run, reconcile actual usage and release the unused remainder — all idempotent and race-safe via Postgres RPCs.**

Load-bearing decisions:
1. **Estimate is the reservation.** Reserve `estimatedTasksPerRun` from the COST-2 estimator (an upper bound). The model never guesses; it reuses the deterministic estimator.
2. **Reservation is a real balance, not just ledger events.** Add a `tasks_reserved` counter on `user_billing` so `available = tasks_limit − tasks_used − tasks_reserved`. Ledger events alone cannot prevent concurrent overspend; the atomic counter can.
3. **Reconcile converts reserved → used.** On completion, charge the actual successful billable tasks, release the rest. State-machine + run-id idempotency make a double reconcile a no-op.
4. **Bounded by construction.** Because the reservation is the upper bound and V2 has no dynamic-count nodes yet, in-run actual can never exceed reserved in v1. When dynamic nodes (loops/bulk) ship, they require per-item reservation/checkpointing *before* launch.
5. **Ship behind a flag, in shadow mode first.** Compute reserve/reconcile alongside the flat gate without affecting balances, compare, then cut over.

This is additive and reversible: the flat gate stays the fallback until the new path is proven.

---

## 2. Current system recap

What exists today (verified against the repo):

- **Flat 1/run live billing.** [`engine.ts`](../../../services/execution/engine.ts) calls [`executionBillingGate(userId, { testMode })`](../../../services/billing/executionBillingGate.ts) **before any handler runs**. The gate calls [`userBillingRepo.deductTasks(userId, 1)`](../../../repositories/userBilling.ts) → the **atomic** `deduct_tasks_if_available(p_user_id, p_amount)` RPC ([migration](../../../supabase/migrations/20260507000002_user_billing.sql)). Refusal → `BILLING_EXHAUSTED` fatal before side effects.
- **COST-2A test-mode skip.** `{ testMode: true }` returns a skipped outcome with no DB round-trip — test/dry-run runs never bill.
- **COST-2 estimator.** [`estimateWorkflowTaskCost`](../../../services/billing/workflowCostEstimator.ts) → `estimatedTasksPerRun` (upper bound) + warnings (branching / schedule / event-volume / unknown-node).
- **COST-3 ledger.** `task_usage_events` (append-only) + per-run `workflow_runs` columns `estimated_task_cost` / `actual_task_cost` / `task_cost_policy_version`. Post-run, [`computeRunTaskUsage` + `recordRunActuals`](../../../services/billing/taskUsageRecorder.ts) write `run_estimate_recorded` + one `node_task_charged` per successful billable node — **ledger only, fail-open, does not deduct.**
- **COST-5 preview.** [`getWorkflowCostPreview`](../../../services/billing/workflowCostPreview.ts) + `GET /api/workflows/[id]/cost-preview` — read-only.
- **COST-7 analytics.** [`taskUsageStats`](../../../services/analytics/taskUsageStats.ts) + [`ownerAiStats`](../../../services/analytics/ownerAiStats.ts) — backend services.

**Why this is not enough:**
- Charge is **not proportional** to workflow complexity — a 1-node and a 20-node workflow both cost exactly 1.
- **Branches/filters** mean the executed path (and real cost) differs from the estimate.
- **Future loops/bulk/custom nodes** can multiply cost; flat 1/run can't express that.
- Owner analytics + preview now exist, but **live billing ignores them** — the measured "actual" never reaches the user's balance.

**Known foundation gaps this design must close:**
- `task_usage_events` has **no UNIQUE idempotency constraint** today (only indexes) — retries could duplicate rows.
- `user_billing` has **no reserved counter** — there is no way to hold capacity across a run.
- There is **no reconciliation step** wired into the engine balance path.

---

## 3. Core billing model recommendation

The target **product** billing model (proposal — Marcus must approve the rows flagged ⚠):

| Event | Bill? | Note |
|---|---|---|
| Successful billable action/node execution | **Yes** | The unit of value. Proportional to work done. |
| Trigger firing/listening | **No** | Free; the run's actions carry the cost. |
| Native control-flow (`if_then_condition`, `router`, `delay`, `format_transformer`) | **No** | In-process, no external work. |
| Failed validation / config / missing-variable | **No** | No external work performed. |
| Test / dry-run | **No** | COST-2A — never reserve, never bill. |
| ⚠ Failed provider attempt (handler error after a real call) | **No (v1)** | Track attempt failures internally for a future product decision; do not bill initially. |
| Partial success | **Yes, for the successes** | 3 of 4 billable actions succeed → charge 3. |
| Deduped / filtered trigger event | **No** | Event dropped before a run → no run → no charge. |

Clarifications:
- This is a **product decision proposal**, not implementation. The deterministic policy ([`taskCostPolicy.ts`](../../../services/billing/taskCostPolicy.ts) `v1`) already classifies *which* nodes are billable; this section decides *when the charge lands* (success vs attempt) and *partial-run* behavior.
- **Decisions Marcus must explicitly approve:** (a) failed provider attempts stay non-billable in v1; (b) partial runs bill per successful billable node; (c) the unit stays "1 task per successful billable action" unless a central override (e.g. `native:http_request`, future `perItemTasks`) says otherwise.

---

## 4. Reserve strategy

How much to hold before a run.

| Option | Description | Verdict |
|---|---|---|
| **A** | Reserve `estimatedTasksPerRun` (COST-2). | **Recommended.** |
| B | Reserve `max(1, estimatedTasksPerRun)`. | Rejected — over-reserves 0-cost runs (control-flow-only); refunded later but adds noise + false "insufficient" blocks. |
| C | Reserve flat 1, reconcile actual later. | Rejected — under-reserves multi-action runs; reconcile can overshoot remaining balance. |
| D | No reservation; deduct after each successful node. | Rejected — the core anti-pattern: races, mid-run insolvency, side effects the user can't pay for. |
| E | Plan-specific reserve rules. | Deferred — a later refinement layered on A. |

**Recommendation: Option A.** Reserve `estimatedTasksPerRun` because it is the estimator's **upper bound** — reserving it guarantees the run can complete within its hold, and the unused remainder is refunded at reconcile.

Rules:
- `reserveAmount = max(0, estimatedTasksPerRun)`. **Estimate 0 → reserve 0** (no DB write, run proceeds; reconcile charges 0).
- **No AI guesses, ever** — the reservation comes only from the deterministic estimator.
- **High-variance / unknown warnings** (`UNKNOWN_NODE_TYPE`, `EVENT_VOLUME_UNKNOWN`) → the estimate may understate cost. v1 mitigation: still reserve the estimate, but require a configurable **minimum free balance** to start such a run, and surface the warning in preview/activation. (A stricter "block until grounded" policy is a Marcus decision.)

Edge cases:
- **Event-driven workflows:** the estimate is per-run (one fired event → one run). Reserve the per-run estimate at run start, same as any run. Event *volume* is not reserved (we don't pre-charge for future events).
- **Scheduled workflows:** same — reserve per-run at each fire. Monthly projection stays a preview-only concern (`SCHEDULE_ESTIMATE_UNAVAILABLE`).
- **Branch upper-bound estimates:** reserving the upper bound is *correct and safe* — actual ≤ estimate, remainder refunded. The `BRANCHING_UPPER_BOUND` warning explains to the user why "estimated 4, used 2."
- **Unknown nodes:** counted as 0 in the estimate with a warning → under-reservation risk. v1: allow with min-balance guard; flag for the stricter-policy decision.
- **Future loops/bulk nodes:** upper-bound reservation is impossible without a known item count. These nodes **must not ship** until per-item reservation/checkpointing exists (§6). Until then the estimator returns a worst-case-capped figure or refuses to estimate.
- **Insufficient balance before run:** `reserve_tasks_if_available` returns `ok:false` → engine aborts with `BILLING_EXHAUSTED` before any handler (identical UX to today's gate refusal).
- **Concurrent runs:** two runs reserving at once are serialized by the row lock inside the RPC (same mechanism as today's deduct), so combined reservations can never exceed `tasks_limit`.

---

## 5. Reconcile strategy

What happens after execution. Inputs: `reservedAmount` (held at start), `actualAmount` (sum of successful billable nodes from `computeRunTaskUsage`).

| Outcome | Handling |
|---|---|
| actual == reserved | Charge `reserved`; release 0. |
| actual < reserved | Charge `actual`; **release `reserved − actual`** (refund to available). |
| actual > reserved | **Cannot happen in v1** (reserve = upper bound, no dynamic nodes). If a future dynamic node makes it possible, the per-node guard (§6) stops execution at `BILLING_EXHAUSTED` before exceeding the reservation, so reconcile only ever sees actual ≤ reserved. As defense in depth, reconcile clamps `charge = min(actual, reserved)` and emits a `RECONCILE_OVER_RESERVE` diagnostic for owner analytics. |
| Run fails before any billable action | actual = 0 → charge 0, release full reservation. |
| Run partially succeeds then fails | Charge the successful billable nodes; release the rest. |
| Ledger recording fails | Balance reconciliation (RPC) is the source of truth and must succeed; the audit-ledger write is fail-open (logged). Balance correctness never depends on the ledger write. |
| Reconciliation runs twice | **Idempotent** — guarded by `billing_status` state machine + run-id; the second call is a no-op returning the first result. |
| Workflow retried | A retry is a **new run** with its **own** reservation/reconcile cycle keyed on the new run id. No cross-run reuse of holds. |

**Recommendation:**
- Charge **actual successful billable usage**; **release unused reserved** tasks.
- `actual > reserved` is prevented upstream (§6) and clamped defensively at reconcile.
- Reconciliation is **idempotent** and **atomic** (single RPC mutates the balance counters + flips `billing_status`).

---

## 6. Mid-run insufficient balance (the hard part)

| Option | Description | Verdict |
|---|---|---|
| **A** | Reserve enough upfront; allow all nodes within the reserve. | **Recommended (v1 core).** |
| **C** | Stop before a billable node if remaining reserved capacity is insufficient. | **Recommended (v1 guard, defense in depth).** |
| B | Check balance before each billable node (against live balance, not reserve). | Rejected for v1 — re-introduces races; the reservation already guarantees capacity. Keep as the mechanism *inside* loops later. |
| D | Allow temporary negative balance. | Rejected — unbounded overage; users perform work they can't pay for. |
| E | Plan overage rules. | Deferred — a later layer (ties to COST overage work). |

**Recommended safe first version:**
- **Reserve the estimated upper bound before the run** (§4). Execution proceeds freely *within* the reservation — no per-node balance hit, because capacity is already held.
- **Do not allow unbounded overage.** Each billable node decrements an in-memory `remainingReserved` counter; if a node *would* exceed `remainingReserved` (only reachable via a future dynamic node), the engine **stops with `BILLING_EXHAUSTED` before the external side effect** and reconciles what succeeded.
- **Future loops/bulk nodes require per-item reservation/checkpointing before they ship** — either (a) reserve `base + perItem × maxItems` upfront, or (b) reserve in checkpointed batches and stop the loop cleanly when a batch can't be reserved. This is a hard prerequisite, not an afterthought.

The invariant: **no billable external side effect occurs without held capacity to pay for it.**

---

## 7. Data model changes

Existing reserved-but-unused building blocks:
- `task_usage_events` already declares the event types `billing_reserved`, `billing_reconciled`, `billing_refunded` (and `internal_poll_cost_recorded`) — defined in COST-3, never emitted yet.
- `workflow_runs` already has `estimated_task_cost`, `actual_task_cost`, `task_cost_policy_version`.

**Can reservations live only in `task_usage_events`?** No. The ledger is an append-only audit trail; deriving "currently reserved" by summing events on every reserve is racey and slow. A **real reserved-balance column** is required so the reserve check is a single atomic predicate under a row lock.

**Recommended schema (COST-12, design only here):**

`user_billing` — add the authoritative reserved counter:
```
ALTER TABLE public.user_billing
  ADD COLUMN tasks_reserved int NOT NULL DEFAULT 0;
-- available = tasks_limit - tasks_used - tasks_reserved
```

`workflow_runs` — add per-run reservation/reconcile state:
```
ALTER TABLE public.workflow_runs
  ADD COLUMN reserved_task_cost   int,
  ADD COLUMN reconciled_task_cost int,
  ADD COLUMN billing_status       text,        -- none|reserved|reconciled|released|failed
  ADD COLUMN reservation_id       uuid,        -- idempotency anchor (defaults to run id is fine)
  ADD COLUMN reservation_expires_at timestamptz,
  ADD COLUMN billing_reconciled_at  timestamptz;
```

**Separate `task_reservations` table — recommended NO for v1.** The run *is* the reservation; `workflow_runs` columns + the `user_billing.tasks_reserved` counter capture everything. A separate table is only justified if reservations ever decouple from runs (e.g. multi-run holds) — not the case in v1. Revisit if loops need sub-run reservations.

**`task_usage_events` idempotency — required:** add the UNIQUE constraint the COST-1 audit recommended but COST-3 deferred:
```
-- node_id NULL for run-level events; use a partial/coalesced unique strategy.
CREATE UNIQUE INDEX task_usage_events_idem
  ON public.task_usage_events (user_id, workflow_run_id, coalesce(node_id,''), event_type);
```

**Orphaned reservations:** a run that crashes between reserve and reconcile leaks held tasks. Mitigate with `reservation_expires_at` + a sweep cron (`release_expired_reservations`) that releases holds for runs stuck in `billing_status='reserved'` past expiry. (New cron — design only.)

Concurrency: the `tasks_reserved` counter + the row-lock predicate in the reserve RPC is exactly the COST-1N race-safe pattern, extended from "used" to "used + reserved". Concurrent runs can never collectively reserve beyond `tasks_limit`.

---

## 8. Atomicity / RPC design

Today: `deduct_tasks_if_available(p_user_id, p_amount)` — atomic, `SECURITY DEFINER`, service_role-only.

**New RPCs (COST-12, design only):**

- `reserve_tasks_if_available(p_user_id uuid, p_amount int, p_run_id uuid) → jsonb {ok, used, reserved, limit}`
  Atomic: `UPDATE user_billing SET tasks_reserved = tasks_reserved + p_amount WHERE user_id = p_user_id AND tasks_used + tasks_reserved + p_amount <= tasks_limit`. Idempotent on `p_run_id` (if the run already holds a reservation, return it). `p_amount = 0` → trivially ok, no write.
- `reconcile_task_reservation(p_user_id uuid, p_run_id uuid, p_actual int, p_reserved int) → jsonb {ok, used, reserved, limit}`
  Atomic + idempotent on `billing_status`: `tasks_used += min(p_actual, p_reserved)`, `tasks_reserved -= p_reserved`, set run `billing_status='reconciled'`. A second call on an already-reconciled run is a no-op returning the stored result.
- `release_task_reservation(p_user_id uuid, p_run_id uuid) → jsonb {ok, reserved, limit}`
  Releases a full hold without charging (fatal-before-execution / cancellation). `tasks_reserved -= reserved_amount`, set `billing_status='released'`. Idempotent.
- `release_expired_reservations(p_now timestamptz) → int` — sweep for orphaned holds (cron).

**Design rules:**
- **All balance mutation goes through RPCs** — never read-then-write in app code (the COST-1N lesson).
- **Idempotent with run/reservation ids** — every RPC keys on `p_run_id` and/or `billing_status` so retries/double-fires are no-ops.
- **Ledger write + balance mutation transactionally tied where possible.** Preferred: the RPC inserts the corresponding `task_usage_events` row(s) inside the same transaction as the counter mutation, so balance and audit can never diverge. If the audit insert must stay app-side for shape reasons, the balance RPC is authoritative and the ledger write is fail-open + reconciled by a checker.
- **`SECURITY DEFINER` + service_role-only grants**, mirroring `deduct_tasks_if_available`.
- The flat `deduct_tasks_if_available` stays untouched (fallback during rollout).

---

## 9. Ledger / event design

Event flow for one real run (test runs emit none):

| Event | When written | Affects balance? | Required ids | Idempotency key | Metadata (redacted) |
|---|---|---|---|---|---|
| `run_estimate_recorded` | run finalize (already today) | No | user, workflow, run | (user, run, '', type) | estimate-vs-actual counts |
| `billing_reserved` | reserve RPC, pre-execution | **Yes** (tasks_reserved+) | user, workflow, run | (user, run, '', type) | reservedTasks, policyVersion |
| `node_task_charged` | per successful billable node (already today) | accounted at reconcile | user, workflow, run, node | (user, run, node, type) | source (override/default) |
| `billing_reconciled` | reconcile RPC, post-execution | **Yes** (used+, reserved−) | user, workflow, run | (user, run, '', type) | actualTasks, reservedTasks |
| `billing_refunded` | reconcile/release when reserved>actual | **Yes** (reserved−) | user, workflow, run | (user, run, '', type) | refundedTasks |
| `billing_exhausted` | reserve fails / per-node guard stops run | No (informational) | user, workflow, run | (user, run, '', type) | requested, available |
| `billing_reservation_failed` | reserve RPC ok:false | No | user, workflow, run | (user, run, '', type) | requested, available |
| `internal_poll_cost_recorded` | polling check, no event (future) | No (internal cost only) | user, workflow | (user, run?, '', type) | pollCost |

Rules:
- **No secrets / raw configs / payloads** — only ids, counts, policy version, enums. Same redaction discipline as COST-3/6/7 (recorder writes numeric/enum summaries only).
- Balance-affecting events are written **inside the RPC transaction** (or fail-open audit mirror of an authoritative RPC mutation).
- The new UNIQUE index (§7) backs the idempotency keys above.

---

## 10. Execution integration points

Where code changes later (design only — no edits in this slice):

- **[`executionBillingGate.ts`](../../../services/billing/executionBillingGate.ts)** — gains a reserve path behind the flag. New shape: `reserve(userId, { runId, reserveAmount, testMode })` returning a reservation outcome; the existing flat path stays as fallback.
- **[`engine.ts`](../../../services/execution/engine.ts)** — three touch points:
  1. **Estimate + reserve** *before* the trigger-resolution/execution loop (replaces the flat gate when flagged). Reserve refusal → `BILLING_EXHAUSTED` fatal before any handler (same position as today's gate at `engine.ts:228`).
  2. **Per-node guard** inside the execution loop — decrement `remainingReserved` on each successful billable node; stop with `BILLING_EXHAUSTED` before a side effect that would exceed the hold (only reachable via future dynamic nodes).
  3. **Reconcile** at finalize (replaces/augments the current `recordRunActuals` block at `engine.ts:509-526`): compute actual via `computeRunTaskUsage`, call `reconcile_task_reservation`, then write the audit ledger (fail-open).
- **[`taskUsageRecorder.ts`](../../../services/billing/taskUsageRecorder.ts)** — `computeRunTaskUsage` (already pure) feeds the actual figure; `recordRunActuals` extended to emit the reconcile/refund audit events (balance change stays in the RPC).
- **[`userBilling.ts`](../../../repositories/userBilling.ts)** — add `reserveTasks`, `reconcileReservation`, `releaseReservation` wrappers over the new RPCs.
- **`workflowRuns` repo** — persist `reserved_task_cost` / `reconciled_task_cost` / `billing_status` / `reservation_id` / `reservation_expires_at` / `billing_reconciled_at`.
- **Node execution service** — surface per-node success so the per-node guard + actual accounting are accurate.

Lifecycle handling:
- **Fatal-before-execution** (trigger-not-found, etc.): if a reservation was taken, **release it** (no charge). If reservation happens *after* the fatal checks (recommended ordering), nothing to release.
- **Test mode:** never reserve, never reconcile, never bill (COST-2A invariant extends unchanged).
- **Cancellation / mid-run failure:** reconcile the successful portion; release the remainder.
- **Engine crash:** reservation left in `reserved` state is reclaimed by the expiry sweep cron.

Ordering recommendation: run all fatal pre-checks first, then reserve, then execute, then reconcile — so a fatal pre-check never needs a release.

---

## 11. Migration path

Phased, flag-gated, reversible:

| Slice | Deliverable | Notes |
|---|---|---|
| **COST-11** | This design doc. | doc-only (here). |
| **COST-12** | Reservation schema + RPCs (`tasks_reserved`, run columns, ledger UNIQUE, reserve/reconcile/release/expire RPCs). | Migration + RPCs only; nothing calls them yet. |
| **COST-13** | Reservation/ledger service layer behind `ENABLE_RESERVE_RECONCILE` (off). | `userBilling` wrappers + recorder extensions; unit-tested in isolation. |
| **COST-14** | Engine integration in **shadow mode**. | Reserve/reconcile computed + recorded but **does not affect the authoritative balance**; flat gate still bills. Emit a comparison log (flat vs proposed) for every run. |
| **COST-15** | Enable reserve/reconcile for **test/internal users** (per-user flag or allowlist). | Real balance effect for opted-in users only; monitor reconciliation correctness. |
| **COST-16** | Switch production billing from flat 1/run to reserve/reconcile. | Global flag flip after shadow + internal confidence. |
| **COST-17** | Deprecate/remove the flat pre-deduct gate. | After a soak period; keep the RPC for emergency rollback until removed. |

Shadow mode (COST-14) is the key safety mechanism: it produces a real dataset of "what the user *would* have been charged" without charging, so the cutover is data-driven, not hopeful.

---

## 12. Backwards compatibility

- **`tasks_used` counter:** unchanged semantics; reconcile increments it by actual instead of the gate incrementing by 1. The period-reset path must also zero `tasks_reserved` (and the expiry sweep must clear stale holds at reset).
- **Existing `workflow_runs` without cost columns:** legacy rows have NULL reserve/reconcile fields → treated as `billing_status = legacy_flat`. Analytics must bucket them separately.
- **Existing `task_usage_events`:** older rows predate the UNIQUE index; create the index `CONCURRENTLY` and resolve any historical dupes first (audit query) before enforcing.
- **Runs before reserve/reconcile:** flat-billed; never retro-reconciled.
- **Analytics mixing modes:** owner analytics gain a `billingMode` dimension (`flat` vs `reserve_reconcile`) so dashboards don't blend incomparable runs.
- **Policy versioning:** every reservation + reconciliation stamps `cost_policy_version` (already on the ledger + run row) so a run is attributable to the policy it was costed under.
- **Rollback plan:** the flag flip is reversible at every phase; COST-16 can revert to the flat gate instantly because `deduct_tasks_if_available` is never removed until COST-17. A stuck-reservation incident is recoverable via the release/expire RPCs.

---

## 13. User-facing behavior

- **Builder cost preview** shows estimated tasks/run (COST-5 already powers this).
- **Activation / run-start** warns when estimated cost exceeds remaining tasks (preview already computes `wouldExceedCurrentRemaining`).
- **Run stopped for insufficient tasks** → a clear error: *"Not enough tasks remaining to run this workflow."* (maps from `BILLING_EXHAUSTED`).
- **No internal "reserve/reconcile" language** in the UI. Users see simple task language:
  - "Estimated 3 tasks per run"
  - "This run used 2 tasks"
  - "Not enough tasks remaining"
- **Refund of unused reservation is invisible** — the user only ever sees the final "used N tasks"; they never see a temporary hold appear and disappear.
- Avoid exposing implementation states (`reserved`, `reconciled`) to end users; those are owner/admin + audit concepts.

---

## 14. Owner/admin analytics behavior

Extend the COST-7 services (additively) to surface:
- **Reserved vs actual** per run / workflow / user (estimate accuracy).
- **Over/under-estimate distribution** — workflows whose actual routinely diverges from the estimate (branching-heavy flows).
- **Reconciliation failures** — runs stuck in `reserved`, expired holds reclaimed by the sweep.
- **High estimate-variance workflows** — candidates for branch-aware estimation.
- **Users/workflows frequently hitting `BILLING_EXHAUSTED`** — upsell / limit-tuning signal.
- **Old flat-billed runs vs new reserve/reconcile runs** — segmented by `billingMode` so trends aren't blended.

All within the existing redaction rules (ids/counts/enums/amounts only; no secrets/payloads).

---

## 15. AI / templates / custom nodes relationship

Even though all three are inactive, the design stays compatible:
- **AI patch preview** uses the estimator only — it shows cost, it never reserves or guesses.
- **AI cannot guess costs** — reservation is always the deterministic estimate.
- **Templates** reuse the same estimator/preview/reserve path — a template is a `WorkflowDefinition`; no separate cost path.
- **Custom nodes** must plug into the central policy/override system (`taskCostPolicy.ts`); the estimator + reserve + reconcile then work unchanged.
- **Future loop/bulk/custom dynamic-count nodes** require per-item reservation/checkpointing (§6) before they ship — non-negotiable prerequisite.
- **AI cost events stay a separate ledger** (`ai_cost_events`, "AI credits") — never mixed into workflow-task reservation/reconciliation.

---

## 16. Risk analysis

| Risk | Mitigation |
|---|---|
| **Accidental overbilling** | Reconcile charges `min(actual, reserved)`; refund unused; shadow-mode comparison before cutover. |
| **Underbilling** | Reserve = upper bound; actual ≤ reserved; unknown-node warning + min-balance guard for ungrounded nodes. |
| **Double charging** | Idempotent RPCs keyed on run id + `billing_status` state machine; ledger UNIQUE index. |
| **Partial failures** | Reconcile the succeeded portion; release the rest; per-node accounting from `computeRunTaskUsage`. |
| **Concurrent runs** | Atomic `tasks_reserved` predicate under the row lock (COST-1N pattern extended). |
| **Retry/idempotency bugs** | Each retry is a new run id with its own cycle; RPCs no-op on repeat; tests target replay. |
| **Ledger/balance mismatch** | Balance mutation + ledger insert in one RPC transaction (or authoritative-RPC + fail-open audit + reconciler check). |
| **Orphaned reservations (engine crash)** | `reservation_expires_at` + `release_expired_reservations` sweep cron. |
| **User confusion** | Simple task language; hide reserve/reconcile internals; invisible refunds. |
| **Migration issues** | Phased + flag-gated + shadow mode; `CONCURRENTLY` index build; dupe audit first; instant rollback to flat gate. |
| **Performance overhead** | One extra RPC at start + one at finalize (the start RPC *replaces* the existing deduct, so net +1 round-trip per run). |
| **Analytics inconsistency** | `billingMode` dimension segregates flat vs reserve/reconcile runs. |

---

## 17. Testing strategy

For the future implementation (per [testing-strategy.md](../../rules/testing-strategy.md); tests mirror `tests/unit/services/billing/`):
- **Reservation atomicity** — succeeds within capacity, fails (`ok:false`) when it would exceed `tasks_limit`.
- **Concurrent-run race** — two reservations summing over the limit: exactly one succeeds.
- **Reconcile exact / under / over reserve** — charge `min(actual, reserved)`, release remainder, `RECONCILE_OVER_RESERVE` diagnostic on the (defended) over case.
- **Idempotent reconcile retry** — second call is a no-op returning the first result.
- **Partial success bills successes** — 3 of 4 → charge 3, release 1.
- **Fatal-before-execution** — releases/refunds any hold; charges 0.
- **Test mode** — never reserves, never reconciles, never bills (regression guard on COST-2A).
- **Insufficient balance stops before external side effect** — `BILLING_EXHAUSTED` precedes any handler call.
- **Ledger ↔ balance parity** — every balance mutation has a matching ledger event; sums reconcile.
- **Feature-flag / rollback** — flag off → flat gate behavior byte-for-byte; shadow mode records but doesn't mutate balance.
- **No secrets in events** — reuse the COST-3/6/7 no-leak assertions.
- **Analytics old/new compatibility** — flat and reserve/reconcile runs bucket separately by `billingMode`.
- **Orphan sweep** — expired `reserved` holds are released; active ones are not.

---

## 18. Recommendation and acceptance criteria

**Recommended implementation sequence:** COST-12 (schema + RPCs) → COST-13 (service layer, flag off) → COST-14 (engine shadow mode) → COST-15 (internal users) → COST-16 (production cutover) → COST-17 (remove flat gate). Shadow mode (COST-14) gates the cutover with real comparison data.

**Recommended model (summary):** reserve `estimatedTasksPerRun` upfront via an atomic `tasks_reserved` counter; execute within the hold with a per-node guard; reconcile actual successful billable usage and refund the remainder; all idempotent + race-safe via Postgres RPCs; rolled out behind a flag with a shadow phase.

**Decisions Marcus must approve before COST-12:**
1. Bill on **success** (not attempt); failed provider attempts non-billable in v1 (track internally).
2. **Partial runs** bill per successful billable node.
3. Reserve **`estimatedTasksPerRun`** (Option A), reserve 0 when estimate is 0.
4. Treatment of **unknown/high-variance** runs (allow with min-balance guard vs block until grounded).
5. **No dynamic-count nodes** (loops/bulk/custom) ship until per-item reservation/checkpointing exists.
6. Add `tasks_reserved` to `user_billing` and the run-level billing columns (vs a separate `task_reservations` table — design recommends columns).
7. Rollout cadence (shadow → internal → production) and who counts as "internal."

**Minimum safe criteria before the live switch (COST-16):**
- Shadow-mode data shows proposed charges within accepted tolerance of flat for representative workflows.
- All §17 tests green, including concurrency + idempotency + orphan sweep.
- Rollback to the flat gate verified working.
- Owner analytics segment `flat` vs `reserve_reconcile`.

**This document does not change live billing.** Live billing remains flat 1/run (real) + test-skip until Marcus approves the decisions above and the COST-12+ slices ship behind their flags.
