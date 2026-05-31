# 4.ACCOUNT-MODEL-9 — Account Billing Rescope Plan (planning doc only)

## Context

The V2 account ownership model is ratified at [`docs/rules/account-ownership-model.md`](../../rules/account-ownership-model.md). Phase A (accounts + memberships + signup trigger) and Phase B (re-scope `workflows`, `integrations`, `workflow_runs` from per-user to per-account ownership) are **complete**:

- Phase A foundation shipped per [`account-model-foundation-plan.md`](./account-model-foundation-plan.md).
- Phase B cutover shipped across slices -5 → -8 per [`account-id-cutover-plan.md`](./account-id-cutover-plan.md), ending with the `workflow_runs` cutover at commit `c752a49e8` (slice 4.ACCOUNT-MODEL-8). The read-only `/runs` page landed account-scoped from the start at commits `55449896b` + `bc2d9d292` (4.RUNS-PAGE-1).

After Phase B, every hot table (`workflows`, `integrations`, `workflow_runs`) is `account_id`-owned with membership-based RLS; `user_id` survives only as provenance (`created_by_user_id`, `connected_by_user_id`, `triggered_by_user_id`). **Billing was deliberately fenced out of Phase B** — see [`account-id-cutover-plan.md`](./account-id-cutover-plan.md) §"Billing implications" (principle 7: "Billing keeps user-scoped"). The execution engine still threads `workflow.createdByUserId` to the billing path, and `user_billing` rows remain 1:1 with users.

**This slice plans Phase C — re-scoping billing and usage from user ownership to account ownership**, per rule doc §19 ("Phase C — Billing. Introduce `account_billing(account_id)` mirroring V1's `user_billing` shape. Backfill from `user_billing(user_id)` via personal accounts. Re-point the billing gate, cost preview, task deduction RPC, and Stripe customer attachment from user-scoped to account-scoped."). It also resolves rule doc §"Risks and open questions" items flagged "Resolve in the Phase C slice plan."

This document is a **planning doc only**. Producing it is the deliverable of slice 4.ACCOUNT-MODEL-9. The implementation lands across the subsequent slices named in §"Recommended implementation slices," each gated by its own approval. **No migration, source, test, or Stripe config ships from this slice.**

### A correction to the inherited framing

The Phase B plan and the rule doc both describe Phase C in V1's terms — "Stripe customer attachment," "packs," "overage." **None of those exist in V2 yet.** V2's billing is entirely internal: a `user_billing` quota table plus a set of `SECURITY DEFINER` Postgres RPCs. There is no ChainReact-billing Stripe integration, no `pack_purchases`, no overage, no metered subscription. Phase C is therefore narrower and lower-risk than the V1 mental model implies — but it carries one **latent correctness bug introduced by Phase B** that this slice must close (see §"Current billing state" item 7 and §"Risks"). This plan describes V2 as it actually is, not as V1 was.

## Current billing state

Audited against the live migrations and the `services/billing/**` + `repositories/**` code as of `c752a49e8`.

1. **`user_billing` is minimal.** Columns: `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `tasks_limit int DEFAULT 100`, `tasks_used int DEFAULT 0`, `tasks_reserved int DEFAULT 0` (added in the reserve/reconcile foundation), `period_started_at`, `created_at`, `updated_at`. RLS: `user_billing_select_own` = `auth.uid() = user_id`; no user-facing write policies (writes are RPC/service-role only). Defined in [`20260507000002_user_billing.sql`](../../../supabase/migrations/20260507000002_user_billing.sql); `tasks_reserved` added in [`20260525000002_reserve_reconcile_billing.sql`](../../../supabase/migrations/20260525000002_reserve_reconcile_billing.sql).

2. **Live billing is flat 1-task-per-run.** [`services/billing/executionBillingGate.ts`](../../../services/billing/executionBillingGate.ts) calls `userBillingRepo.deductTasks(userId, 1)` pre-execution. `userId` is `workflow.createdByUserId`, threaded from the engine ([`services/execution/engine.ts`](../../../services/execution/engine.ts) ~line 318). The deduction is atomic via the `deduct_tasks_if_available(p_user_id, p_amount)` RPC (single `UPDATE ... WHERE tasks_used + p_amount <= tasks_limit RETURNING` under the row lock). Test/dry-run runs skip the gate (COST-2A).

3. **Reserve/reconcile is built but gated OFF.** [`services/billing/reserveReconcileBilling.ts`](../../../services/billing/reserveReconcileBilling.ts) wraps four RPCs and is gated by `ENABLE_RESERVE_RECONCILE_BILLING` (default `false`, [`services/billing/billingFeatureFlags.ts`](../../../services/billing/billingFeatureFlags.ts)). The engine has both code paths wired (`createBillingReservation` ~line 285, `reconcileBillingReservation` ~line 604) but production uses the flat path because the flag is off. Per-run reservation state lives on `workflow_runs` columns (`reserved_task_cost`, `reconciled_task_cost`, `billing_status`, `reservation_id`, `reservation_expires_at`, `billing_reconciled_at`) — these are **per-run, not per-user**, so they carry no ownership key of their own.

4. **Three append-only ledgers, all `user_id`-scoped.**
   - `task_usage_events` ([`20260525000000_task_usage_events.sql`](../../../supabase/migrations/20260525000000_task_usage_events.sql)) — actual per-node task charges + run estimate. Written by the engine (service-role); repo [`repositories/taskUsageEvents.ts`](../../../repositories/taskUsageEvents.ts). RLS `auth.uid() = user_id`.
   - `ai_cost_events` ([`20260525000001_ai_cost_events.sql`](../../../supabase/migrations/20260525000001_ai_cost_events.sql)) — AI credits / observability. **No writers yet** (AI is paused); repo [`repositories/aiCostEvents.ts`](../../../repositories/aiCostEvents.ts) backs the one live read route `GET /api/ai/usage`. RLS `auth.uid() = user_id`.
   - `billing_shadow_comparisons` ([`20260525000003_billing_shadow_comparisons.sql`](../../../supabase/migrations/20260525000003_billing_shadow_comparisons.sql)) — flat-vs-reserve hypotheticals (COST-14). Service-role writes only; repo [`repositories/billingShadowComparisons.ts`](../../../repositories/billingShadowComparisons.ts). RLS `auth.uid() = user_id`.

5. **Cost estimation is pure and account-neutral.** [`services/billing/taskCostPolicy.ts`](../../../services/billing/taskCostPolicy.ts) (`TASK_COST_POLICY_VERSION = 'v1'`) and [`services/billing/workflowCostEstimator.ts`](../../../services/billing/workflowCostEstimator.ts) take only a `WorkflowDefinition` — zero `user_id`/`account_id` dependency. The cost-preview service [`services/billing/workflowCostPreview.ts`](../../../services/billing/workflowCostPreview.ts) (`GET /api/workflows/[id]/cost-preview`) is the only user-scoped wrapper: it resolves the caller's personal account (`ensurePersonalAccount`), checks `workflow.accountId` ownership, and reads `userBillingRepo.getUsage(userId)` for the "tasks remaining" summary. **It already has `accountId` in hand** — it just reads usage by `userId` today.

6. **Five billing RPCs.** All `SECURITY DEFINER`, `service_role`-only:
   - `deduct_tasks_if_available(p_user_id, p_amount)` — touches `user_billing` only. **Not broken.**
   - `reserve_tasks_if_available(p_user_id, p_amount, p_run_id, p_expires_at)`
   - `reconcile_task_reservation(p_user_id, p_run_id, p_actual)`
   - `release_task_reservation(p_user_id, p_run_id)`
   - `release_expired_reservations(p_now)` — no `p_user_id`, sweeps all expired holds.

7. **⚠ The four reserve/reconcile RPCs are latently broken by Phase B.** They each read `workflow_runs ... WHERE id = p_run_id AND user_id = p_user_id` (and `release_expired_reservations` does `SELECT id, user_id, ... FROM workflow_runs`). Slice -8 ([`20260530000004_workflow_runs_account_cutover.sql`](../../../supabase/migrations/20260530000004_workflow_runs_account_cutover.sql) line 89) **dropped `workflow_runs.user_id`** and its scope-fence comment (lines 39-41) incorrectly asserted the RPCs were "untouched." No later migration patches them. Consequences:
   - `reserve_/reconcile_/release_task_reservation` would raise `column "user_id" does not exist` **if called** — but they are dormant (flag off, foundation-only), so nothing calls them today.
   - `release_expired_reservations` **is** called every 10 min by the **un-gated** cron [`app/api/cron/release-expired-reservations/route.ts`](../../../app/api/cron/release-expired-reservations/route.ts). Its `SELECT id, user_id ...` errors against the live schema on every invocation. Practical impact today is nil (no rows ever reach `billing_status='reserved'` because the reserve path is gated off, but the RPC errors at plan time on the dropped column regardless), so it is failing-noisily, not corrupting state. **Phase C must fix this**; ideally the fix lands first as standalone hygiene (see §"Recommended implementation slices," slice -9a).

8. **No period-reset job exists.** Only `period_started_at` exists; nothing zeroes `tasks_used`/`tasks_reserved`. The reserve/reconcile migration documents this gap. Phase C does not add one, but any future reset job must zero counters per `account_id`.

9. **No Zod contracts for billing.** Unlike `workflows`/`integrations`, billing record shapes are inline in the repos. There is no `contracts/billing.ts`.

10. **Stripe is a workflow provider, not a billing backend.** [`integrations/stripe/manifest.ts`](../../../integrations/stripe/manifest.ts) exposes Stripe as a user-connected provider integration (payment-intent / checkout / subscription *actions* a user's workflow can call against *their own merchant account*). It has **nothing** to do with ChainReact charging its own customers. There is no ChainReact Stripe customer, subscription, metered price, pack, or overage anywhere in V2.

## Tables / functions / RPCs in scope

**Tables re-keyed `user_id` → `account_id`:**

| Table | Today | Phase C |
|---|---|---|
| `user_billing` | `user_id` PK | **Replaced by** `account_billing` (`account_id` PK) — new table, backfilled, old table dropped. |
| `task_usage_events` | `user_id` NOT NULL | `account_id` NOT NULL (+ optional `triggered_by_user_id` actor provenance). |
| `ai_cost_events` | `user_id` NOT NULL | `account_id` NOT NULL (decision below; no writers today → lowest-risk table). |
| `billing_shadow_comparisons` | `user_id` NOT NULL | `account_id` NOT NULL. |

**Functions / RPCs re-keyed `p_user_id` → `p_account_id`:**

- `deduct_tasks_if_available(p_account_id, p_amount)` — re-key; keys `account_billing`.
- `reserve_tasks_if_available(p_account_id, p_amount, p_run_id, p_expires_at)` — re-key **and** fix the `workflow_runs` join to `WHERE id = p_run_id AND account_id = p_account_id`.
- `reconcile_task_reservation(p_account_id, p_run_id, p_actual)` — re-key + fix `workflow_runs` join.
- `release_task_reservation(p_account_id, p_run_id)` — re-key + fix `workflow_runs` join.
- `release_expired_reservations(p_now)` — no key param; fix its internal `SELECT id, account_id, ... FROM workflow_runs` and the `account_billing` UPDATE.
- `handle_new_user()` — re-point the `user_billing` seed insert to `account_billing(account_id)` keyed on the just-created personal account; **reorder** so the `accounts` insert precedes the billing insert (FK dependency).

**Code re-pointed user→account:**

- `repositories/userBilling.ts` → `repositories/accountBilling.ts` (or keep filename, change signatures): `deductTasks(accountId, ...)`, `reserveTasks(accountId, ...)`, `reconcileReservation(accountId, ...)`, `releaseReservation(accountId, ...)`, `getUsage(accountId)`.
- `services/billing/executionBillingGate.ts`, `services/billing/reserveReconcileBilling.ts`, `services/billing/billingShadowComparisons.ts` — `userId` params → `accountId`.
- `repositories/taskUsageEvents.ts`, `repositories/aiCostEvents.ts`, `repositories/billingShadowComparisons.ts` — insert/read keyed on `accountId`.
- `services/billing/workflowCostPreview.ts` — read usage by `accountId` (already resolves it).
- `services/execution/engine.ts` — thread `workflow.accountId` (not `createdByUserId`) into all billing calls.
- `services/billing/taskUsageRecorder.ts`, `services/billing/reserveReconcileShadowMode.ts` — `userId` → `accountId` in their inputs.
- Analytics folds [`services/analytics/ownerAiStats.ts`](../../../services/analytics/ownerAiStats.ts), [`services/analytics/taskUsageStats.ts`](../../../services/analytics/taskUsageStats.ts), [`services/analytics/reserveReconcileShadowStats.ts`](../../../services/analytics/reserveReconcileShadowStats.ts), and the live route [`app/api/ai/usage/route.ts`](../../../app/api/ai/usage/route.ts) (+ [`services/analytics/aiAnalyticsReport.ts`](../../../services/analytics/aiAnalyticsReport.ts)) — see §"Repository/service/API strategy" for the actor-vs-owner split.

**RLS re-pointed:** the `_select_own` policies on `account_billing` (new), `task_usage_events`, `ai_cost_events`, `billing_shadow_comparisons` become account-membership joins.

## Tables / functions explicitly out of scope

Documented so a future slice author doesn't pull them in:

- **`workflow_runs` billing columns** (`reserved_task_cost`, `billing_status`, etc.) — per-run, no ownership key; the run row already carries `account_id` (Phase B). No column change; the RPCs that read them get their join fixed (in scope, above), but the columns themselves are untouched.
- **`notifications`** — stays user-delivered per rule doc §"Risks" (notifications scoping) and Phase B's out-of-scope list. A notification goes to a person, not an account. Phase D reconsiders.
- **`builder_agent_threads`** — per-user builder chat; not billing. Untouched.
- **Cost estimation** (`taskCostPolicy.ts`, `workflowCostEstimator.ts`) — already account-neutral; pure functions, no key change.
- **Provenance columns** (`created_by_user_id`, `triggered_by_user_id`, `connected_by_user_id`) — Phase B owns these; Phase C reads `triggered_by_user_id` for actor attribution but adds/changes none of them.
- **Stripe / packs / overage / metered billing** — do not exist in V2; nothing to migrate. Future-fit guidance only (§"Stripe strategy").
- **Period-reset job** — does not exist; not added here.
- **Admin/owner analytics HTTP routes** — the fold services exist but no route wires them (V2 has no admin-authorization layer yet). Phase C re-keys the *data*; it does not ship cross-account admin routes.
- **`accounts`, `account_memberships`, `workflows`, `integrations`, `workflow_runs` ownership** — already account-scoped; not re-touched.

## Recommended target model

`account_billing(account_id PK)` is the single billing root per account, exactly mirroring `user_billing`'s shape but keyed on the account. Every quota counter, every ledger row, and every RPC keys on `account_id`. The account that owns the workflow (`workflows.account_id`, already populated) is the account charged — never the actor who clicked Run, never the workflow author. This realizes rule doc §"Billing and usage rules" verbatim.

### Decisions (answers to the brief's questions)

- **New table vs rename `user_billing`?** → **New `account_billing` table**, backfilled from `user_billing` via personal accounts, with `user_billing` dropped at cutover. Rationale: (a) the rule doc §4 names `account_billing` as the canonical table; (b) a rename + PK/FK re-key in place is fiddlier than a clean additive create + backfill + drop, with no upside pre-launch; (c) the new-table path lets the re-keyed RPCs and the old RPCs coexist briefly during verification before the drop. The 1:1 personal-account mapping makes the backfill trivial.

- **Which columns move to `account_id`?** → `user_billing`: `user_id` PK → `account_id` PK; keep `tasks_limit`, `tasks_used`, `tasks_reserved`, `period_started_at`, `created_at`, `updated_at` unchanged. The three ledgers: their `user_id` column → `account_id` (see §"Tables in scope").

- **Which billing tables are user-scoped besides `user_billing`?** → `task_usage_events`, `ai_cost_events`, `billing_shadow_comparisons`. (The `workflow_runs` billing columns are per-run, not user-keyed.)

- **`ai_cost_events` — account or actor?** → **`account_id`** for cost ownership (AI credits are a billing unit owned by the account that incurred them), with the **actor** preserved separately if needed (a builder AI interaction is driven by a specific user). Because there are **no writers today** (AI paused), this is the lowest-risk table to re-key and the safest place to set the precedent. Open edge: a builder AI interaction that happens *before any workflow/account context exists* (e.g. pre-creation provider discovery) needs an account to attribute to — resolve to the actor's **personal** account at write time (the same default-account resolution Phase B uses everywhere). Flagged in §"Risks."

- **One slice or several?** → **Several**, mirroring Phase B's foundation-then-cutover discipline (see §"Recommended implementation slices"). Billing's surface is smaller than Phase B's, but the atomic-RPC re-key is the single highest double-charge risk and deserves its own verifiable slice.

- **Temporary compatibility layer?** → Pre-launch V2 has no production traffic, so Phase B's principle 4 ("no dual-write transitional state") applies. Phase C uses an **additive foundation slice** (new `account_billing` + re-keyed RPCs created side-by-side with the old ones + dual RLS where a table is shared) followed by a **clean cutover** that flips callers and drops the old table/RPCs. No long-lived dual-write. A **verification-only parity check** (not a dual-write shadow) proves the backfill and the RPC re-key before the drop — see §"Test plan."

- **What must remain user-scoped?** → `notifications` (delivery to a person), `builder_agent_threads`, and all **actor provenance** (`triggered_by_user_id`, `created_by_user_id`). Actor attribution inside analytics ("which member ran this") keys on the actor user; cost **ownership** keys on the account.

## Migration strategy

Mirrors Phase B's lowest-risk sequence, adapted to billing. All migrations are forward-only, single-transaction, idempotent against re-application, and applied via `npm run db:push` to the V2 dev project (no prod data).

### Slice -9a — RPC hygiene fix (standalone, ships first)

The latent broken-RPC bug (current-state item 7) is independent of the full rescope and should not wait. One migration re-creates the four reserve/reconcile RPCs to remove the `workflow_runs.user_id` reference — **still keyed on `p_user_id`** at this stage (the join changes from `AND user_id = p_user_id` to a `user_id`-free lookup that resolves the run's owner via `workflow_runs.account_id` → `accounts.owner_user_id`, OR simply drops the redundant ownership predicate since `p_run_id` is already the unique key and the caller is trusted service-role). This unbreaks `release_expired_reservations`'s cron immediately without waiting on the account re-key. **Decision point for the implementing slice:** if -9a and -9b are approved together, skip -9a and fold the fix directly into the account re-key (the RPCs are dormant except the cron, and the cron can tolerate a few more days of no-op errors). Default: ship -9a first if there's any gap before -9b.

### Slice -9b — `account_billing` foundation (additive)

One migration, single transaction:

1. **Create `account_billing`** with `account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE RESTRICT` (matches `accounts` root semantics — billing is not implicitly deleted when an auth user is removed) and the same counter columns as `user_billing` (`tasks_limit`, `tasks_used`, `tasks_reserved`, `period_started_at`, `created_at`, `updated_at`). Enable RLS; add the `account_billing_select_account_member` membership-join SELECT policy; no write policies (RPC/service-role only). Add explicit `GRANT SELECT, INSERT, UPDATE, DELETE ... TO service_role` + `GRANT SELECT ... TO authenticated` per [`database-security.md`](../../rules/database-security.md) (post-Oct-2026 Data API rule).
2. **Backfill** one `account_billing` row per personal account from the owner's `user_billing` row (§"Backfill strategy").
3. **Create account-keyed RPCs side-by-side** with the user-keyed ones: `deduct_tasks_if_available(p_account_id, p_amount)` etc. (Postgres overloads by signature, so `(uuid, int)` user vs `(uuid, int)` account collide — therefore the implementing slice either (a) names the account RPCs distinctly during the transition, e.g. `deduct_tasks_if_available_v2`, then renames at cutover, or (b) drops-and-replaces in the same cutover slice. **Default: name distinctly in -9b, rename at -9c** so both keyings are testable simultaneously.) The account RPCs key `account_billing` and use the fixed (`user_id`-free) `workflow_runs` join.
4. **Safety-check assertion** (`DO $$ ... RAISE EXCEPTION IF count(account_billing) <> count(personal accounts) $$`).
5. **Do not** change `handle_new_user`, drop `user_billing`, or change any code yet.

### Slice -9c — billing cutover (atomic)

One migration + the code changes in the same commit:

1. Re-point `handle_new_user` to insert `account_billing(account_id)` (reordered after the `accounts` insert); stop inserting `user_billing`.
2. Rename the `_v2` account RPCs to the canonical names; `DROP` the user-keyed RPCs.
3. Flip `executionBillingGate`, `reserveReconcileBilling`, `userBilling.ts`→`accountBilling.ts`, `workflowCostPreview`, and the engine threading to `accountId` (engine reads `workflow.accountId`).
4. `DROP TABLE user_billing`.
5. Rewrite the directly-affected unit/integration tests in the same slice.

### Slice -9d — ledger rescope (`task_usage_events`, `ai_cost_events`, `billing_shadow_comparisons`)

For each ledger, the cleanest path given pre-launch + small/zero data: add `account_id` column nullable → backfill from `user_id` via personal account → `NOT NULL` → flip RLS `_select_own` to membership-join → drop `user_id` (or keep as actor provenance for `task_usage_events`/`ai_cost_events` if the actor distinction is wanted — **recommend keeping a renamed `triggered_by_user_id`/`created_by_user_id` actor column on the two real ledgers, dropping the plain `user_id` on `billing_shadow_comparisons`**). Fix the partial unique idempotency indexes on `task_usage_events` to key on `(account_id, workflow_run_id, ...)`. Repos + the engine recorder + analytics folds flip to `accountId` in the same slice. `ai_cost_events` is trivial (no writers); `billing_shadow_comparisons` only matters if shadow mode is ever enabled; `task_usage_events` is the one with live writers.

## Stripe / customer / subscription strategy

**There is nothing to migrate.** V2 has no ChainReact-billing Stripe integration — no customer, no subscription, no metered price, no pack, no overage. The brief's questions ("migrate Stripe customer IDs from users to personal accounts," "change Stripe metadata immediately or stay compatible") are **N/A for V2 today**. This must not be faked.

**Forward-fit guidance** (for whenever paid billing is introduced — a future phase, not Phase C):

- The ChainReact Stripe customer attaches to `account_billing.account_id`, never `user_id`, from day one. A user who owns a personal account and belongs to a team account is two distinct Stripe customers (rule doc §"Billing and usage rules").
- Store the Stripe customer / subscription id as columns on `account_billing` (e.g. `stripe_customer_id`, `stripe_subscription_id`) — added in the billing-monetization slice, not here.
- Stripe-side metadata should carry `account_id` (not `user_id`) as the canonical correlation key. Because no Stripe objects exist yet, there is no "immediate vs compatible" tradeoff — the first integration is account-scoped by construction.
- **Per-organization Stripe Connect** (rule doc §"Risks" — "does the schema we pick constrain a future enterprise customer billed via their own Connect account?"): keying billing on `account_id` does **not** constrain this. A future Connect-billed org is still one `account_billing` row; the Connect account id would be an additional column. Phase C's choice (one billing row per account) is compatible with both platform-billed and Connect-billed futures. **Captured per the rule doc's instruction to answer this in the Phase C plan even though it is not implemented.**

## Billing gate / task deduction strategy

The flat gate is the live path and the parity-critical one.

- **Atomicity is preserved exactly.** `deduct_tasks_if_available` re-keyed to `p_account_id` keeps the identical `UPDATE account_billing SET tasks_used = tasks_used + p_amount WHERE account_id = p_account_id AND tasks_used + p_amount <= tasks_limit RETURNING` shape. The row lock + WHERE-predicate check-and-write that prevents concurrent overspend is unchanged — only the key column changes. No "SELECT then UPDATE" is introduced.
- **Engine threading.** `executionBillingGate(workflow.accountId, ...)` replaces `executionBillingGate(workflow.createdByUserId, ...)`. The engine already loads `workflow.accountId` (Phase B). One variable swap at the call site; the gate signature changes `userId` → `accountId`.
- **Cost preview.** `workflowCostPreview` reads `accountBillingRepo.getUsage(accountId)` using the `accountId` it already resolves for the ownership check — removing the only remaining `getUsage(userId)` caller.
- **Materialization.** The re-keyed RPC keeps the `INSERT INTO account_billing (account_id) VALUES (p_account_id) ON CONFLICT DO NOTHING` self-heal, so a missing billing row materializes on first charge (mirrors today).
- **No behavior change for users.** Flat 1-task-per-run, test-mode skip, fail-closed-on-exhaustion all unchanged. Only the ledger the count lives in moves from user to account.

## Reserve / reconcile strategy

Reserve/reconcile stays **gated off** through Phase C (the rollout decision is independent of the rescope). Phase C's job is to make the gated-off machinery *correct under account keying* so that whenever the flag flips, it flips onto account-scoped billing — not to flip it.

- Re-key all four RPCs to `p_account_id` and fix the `workflow_runs` join (the broken-RPC fix and the account re-key converge here; if -9a already fixed the join under `p_user_id`, -9c/-9d re-keys to `p_account_id`).
- The per-run reservation columns on `workflow_runs` are unchanged (per-run, no key).
- `reserveReconcileBilling.ts` service wrappers take `accountId`; the engine passes `workflow.accountId`.
- `release_expired_reservations` decrements `account_billing.tasks_reserved` for each expired run's account (resolved via `workflow_runs.account_id`, which exists).
- Idempotency semantics (status lifecycle on the run row) are untouched.

## Reserve/reconcile shadow strategy

`billing_shadow_comparisons` re-keys to `account_id`. The shadow comparison (flat-vs-reserve) is orthogonal to the user-vs-account rescope and its computation does not change. Note for clarity: the existing shadow mechanism compares **billing models** (flat vs reserve/reconcile), *not* **ownership keys** (user vs account) — Phase C does not reuse it for user-vs-account verification (that's the §"Test plan" parity check instead).

## RLS / security strategy

Every billing table's `_select_own` (`auth.uid() = user_id`) policy becomes the canonical membership-join predicate from rule doc §"RLS and security direction":

```sql
EXISTS (
  SELECT 1 FROM public.account_memberships am
  WHERE am.user_id = auth.uid()
    AND am.account_id = <table>.account_id
)
```

- Applied to `account_billing` (at creation, -9b), and to `task_usage_events` / `ai_cost_events` / `billing_shadow_comparisons` (at their ledger rescope, -9d).
- Writes stay service-role/RPC-only on every billing table — no user-facing write policy is ever added (a user must never mutate their own counters or fabricate ledger rows).
- All five RPCs stay `SECURITY DEFINER` + `service_role`-only (REVOKE from anon/authenticated). The explicit grant remains the auth boundary; re-keying does not change the privilege model.
- The membership-join predicate hits `account_memberships`; the `account_memberships_user_id_idx` added in Phase B foundation supports it. Verify with EXPLAIN on the dev DB.
- Explicit Data API GRANTs accompany the new `account_billing` table (post-Oct-2026 rule).

## Repository / service / API strategy

Same three principles as Phase B's cutover (§"Repository/service/API strategy" there):

1. **Same modules, new signatures.** `userId` ownership params become `accountId`. Consider renaming `repositories/userBilling.ts` → `repositories/accountBilling.ts` for clarity (the table it wraps changes name); the implementing slice decides whether the rename's churn is worth it or whether to keep the filename and change only signatures.
2. **Account resolution at the boundary, not in repos.** Routes/engine resolve `accountId` (engine from `workflow.accountId`; routes from the workflow's account or the caller's personal account) and pass it down. Repos take `accountId` as data.
3. **Engine reads `account_id` from the workflow row** — never resolves an account from a user for billing.

**Analytics actor-vs-owner split** (resolves brief item 8):

- `GET /api/ai/usage` ([`app/api/ai/usage/route.ts`](../../../app/api/ai/usage/route.ts)) is "my AI usage." After rescope, "my" is ambiguous between actor and account. **Recommendation:** make it **account-scoped** (the AI usage of the account the user is acting in), reading `ai_cost_events` by `account_id` via membership RLS — consistent with how `/runs` shows the account's runs, not just the caller's. The actor (`created_by_user_id` on the event, if retained) is available for a future "by member" breakdown.
- The fold services (`ownerAiStats`, `taskUsageStats`, `reserveReconcileShadowStats`) are owner/admin aggregates with **no live route**. Re-key their `userId?` filter to `accountId?`. They stay unwired until V2 has an admin-authorization layer; Phase C does not ship admin routes.
- **No `contracts/billing.ts` exists** — Phase C is a good opportunity to add Zod schemas for `AccountBillingRecord` / `TaskUsageEventRow` / etc., but this is optional polish, not load-bearing; the implementing slice may defer it.

## Backfill and compatibility strategy

In -9b, single migration, after `account_billing` is created:

```sql
-- one account_billing row per personal account, inheriting the owner's counters
INSERT INTO public.account_billing
  (account_id, tasks_limit, tasks_used, tasks_reserved, period_started_at)
SELECT a.id, ub.tasks_limit, ub.tasks_used, ub.tasks_reserved, ub.period_started_at
  FROM public.accounts a
  JOIN public.user_billing ub ON ub.user_id = a.owner_user_id
 WHERE a.type = 'personal'
ON CONFLICT (account_id) DO NOTHING;
```

- **1:1 mapping.** Every personal account inherits exactly its owner's `user_billing` counters — `tasks_limit`, `tasks_used`, `tasks_reserved`, `period_started_at` carried verbatim so no quota is gained or lost at cutover. (Team/org accounts don't exist yet — Phase D — so there is no fan-in/aggregation question to resolve here. When team billing lands, a team account starts with its own fresh `account_billing` row; it does not inherit any member's personal counters.)
- **Ledger backfill** (in -9d, per table): `UPDATE <ledger> e SET account_id = a.id FROM accounts a WHERE a.type='personal' AND a.owner_user_id = e.user_id AND e.account_id IS NULL;` then `NOT NULL` + safety check. `ai_cost_events` has no rows (no writers) so its backfill is a no-op by construction.
- **Idempotent** — `ON CONFLICT DO NOTHING` / `WHERE account_id IS NULL` make re-runs zero-change.
- **Edge: user without a personal account.** Per the Phase A invariant every user has exactly one. If the join finds none, that user's `user_billing` row maps to nothing — the safety check (count parity) catches it and aborts the migration rather than silently dropping a billing row. Same fail-loud posture as Phase B.
- **Compatibility window.** Distinct-named account RPCs (`_v2`) coexisting with user RPCs in -9b means tests can assert parity between the two keyings before -9c drops the user side. That is the only "compat layer," and it lives for one slice.
- **Dev fixtures.** [`tests/integration/billing/reserveReconcileEngine.dev.test.ts`](../../../tests/integration/billing/reserveReconcileEngine.dev.test.ts) creates throwaway users and bills by `userId`; it must resolve each user's personal account and assert against `account_billing`. Rewritten in the slice that re-keys the path it exercises.

## Test plan

Per-slice, citing the parity-critical assertions. The central goal: **prove deduction parity and the absence of double-charge / double-deduct.**

### -9a (RPC hygiene)
- An integration test (dev DB) that the four reserve/reconcile RPCs and the expiry cron **execute without `column "user_id" does not exist`** against the post-Phase-B schema. This is the regression that proves the latent bug is closed.

### -9b (foundation + backfill)
- **Backfill parity:** `count(account_billing) == count(personal accounts) == count(user_billing)`; for every personal account, `account_billing.{tasks_limit,tasks_used,tasks_reserved,period_started_at}` equals the owner's `user_billing` row. Re-running the backfill is a no-op.
- **RPC keying parity (the double-deduct guard):** for a fixed start state, deducting N via the account RPC (`_v2`) leaves `account_billing` in the same end state that the user RPC leaves `user_billing` — same `ok`, same `used`, same exhaustion boundary. Run the existing reserve/reconcile RPC test matrix against the account RPCs.
- **Concurrency:** two concurrent account-keyed deductions that together exceed the limit → exactly one succeeds (row-lock atomicity preserved under the new key). Mirror the existing concurrency assertion.
- **Dual RLS:** the account-member SELECT policy returns the row for a member and nothing for a non-member.

### -9c (cutover)
- Engine charges the **workflow's account**, not the actor: a run of a workflow owned by account A deducts from `account_billing(A)` even when triggered by a different member (forward-looking; today actor==owner, but assert against `accountId`, not `createdByUserId`).
- `handle_new_user` creates exactly one `account_billing` row for the new personal account and **no** `user_billing` row; the account insert precedes the billing insert (no FK violation).
- `user_billing` is gone; no code path references it.
- Cost preview's "tasks remaining" matches `account_billing.tasks_used`/`tasks_limit`.
- Full Jest suite green (non-regression).

### -9d (ledgers)
- Each ledger's rows carry `account_id` resolving to the owner's personal account; RLS membership-join returns own-account rows only; idempotency indexes key on `(account_id, workflow_run_id, ...)` and still reject duplicate ledger rows.
- `task_usage_events` written by a real run keys on the run's `account_id`; test runs write nothing (unchanged).

### Non-regression bar (all slices)
`npm run lint:migrations`, `npm run typecheck`, `npm run lint`, and the full `npx jest` suite pass after each slice. Slices that change repo signatures rewrite the directly-affected unit tests in the same slice.

## Rollout / rollback strategy

**Pre-launch.** No production users, no paid billing. Rollout = apply migration to the dev project, run the suite, commit. No canary, no feature flag for the rescope itself (the reserve/reconcile flag is orthogonal and stays off).

**Rollback per slice:**
- **-9a:** re-create the RPCs from `20260525000002` (the broken originals) — only sensible if reverting alongside a revert of the column drop, which won't happen; effectively forward-only. A botched -9a is fixed forward.
- **-9b:** `DROP TABLE account_billing` + drop the `_v2` RPCs. No code changed, no caller affected — fully reversible via one revert migration.
- **-9c:** re-create `user_billing` (NOT NULL), backfill from `account_billing` via `accounts.owner_user_id` (safe — personal accounts have exactly one owner, Phase A invariant), re-create the user RPCs + the old `handle_new_user`, `git revert` the code commit. Not surgical but bounded; pre-launch with no data.
- **-9d:** re-add each ledger's `user_id`, repopulate from `account_id` → owner, re-add `_own` RLS, revert repo/recorder/analytics code.

**Each implementing slice's commit message must inline its rollback recipe**, per the Phase B convention.

**Migration ordering safety.** Forward-only; reverting code without reverting the migration leaves the DB re-keyed under code that expects the old key. The acceptable revert is code-revert + a follow-up re-add migration. Document per slice.

## Risks and open questions

Flagged for resolution in the implementing slice or a later phase — not blockers for this planning slice.

- **Latent broken RPCs (highest priority).** The four reserve/reconcile RPCs reference dropped `workflow_runs.user_id`; the un-gated expiry cron hits one every 10 min. Harmless today (no reserved rows) but it is an active error and a correctness landmine the moment the reserve flag flips. **-9a closes it.** This is the one finding that argues for moving promptly even though billing is "gated off."
- **Postgres RPC overload collision.** User-keyed and account-keyed `deduct/reserve/...` share `(uuid, ...)` signatures and cannot coexist under the same name. The plan resolves this with transitional `_v2` names renamed at cutover. The implementing slice confirms the rename doesn't strand a caller.
- **`ai_cost_events` account vs actor for pre-workflow AI.** Builder AI interactions can predate a workflow/account context. Recommendation: attribute to the actor's personal account at write time; retain the actor user id as provenance. No writers exist today, so this is a design decision to lock before AI resumes, not a migration risk now.
- **`/api/ai/usage` semantics shift.** Moving it from "my events" (actor) to "this account's events" changes what a future team member sees. Acceptable and consistent with `/runs`, but call it out in the -9d commit since it's a (currently invisible) behavior change.
- **No period-reset job.** Out of scope, but Phase C re-keys the counters a future reset job will zero — that job must operate per `account_id` and release in-flight holds. Documented so the reset slice doesn't strand reserved tasks.
- **Team/org billing fan-in (Phase D).** Phase C handles personal accounts only (the only type that exists). When team accounts ship, they get fresh `account_billing` rows — no member-counter inheritance. The schema chosen here (one row per account) supports that without change; confirm in the Phase D plan.
- **Stripe monetization is a separate future phase.** Phase C deliberately ships zero Stripe. The forward-fit (account-keyed customer, Connect-compatible) is captured in §"Stripe strategy" per the rule doc's instruction, but no schema lands for it here.
- **`contracts/billing.ts` absence.** Optional to add during Phase C; not load-bearing. Decide in the implementing slice.

## Recommended implementation slices

Ordered; each gates the next.

- **4.ACCOUNT-MODEL-9a — RPC hygiene fix.** Re-create the four reserve/reconcile RPCs without the `workflow_runs.user_id` reference (still `p_user_id`-keyed). Unbreaks the expiry cron. One migration, no code, RPC-execution regression test. *May be folded into -9b if approved together and the few-day cron-error gap is acceptable.*
- **4.ACCOUNT-MODEL-9b — `account_billing` foundation.** Create the table, backfill from `user_billing` via personal accounts, create `_v2` account-keyed RPCs side-by-side, dual RLS, parity + concurrency tests. No code, no drops.
- **4.ACCOUNT-MODEL-9c — Billing cutover.** Re-point `handle_new_user`, rename `_v2` RPCs to canonical + drop user RPCs, flip the gate / repo / cost-preview / engine threading to `accountId`, drop `user_billing`, rewrite affected tests.
- **4.ACCOUNT-MODEL-9d — Ledger rescope.** Re-key `task_usage_events`, `ai_cost_events`, `billing_shadow_comparisons` to `account_id` (add → backfill → NOT NULL → RLS flip → drop/rename `user_id`), fix idempotency indexes, flip the recorder + analytics + `/api/ai/usage`.

Gating: -9a (or its fold into -9b) → -9b → -9c → -9d. -9c is the only slice that changes live billing behavior (the key the flat gate charges). -9d is mostly mechanical (one ledger has live writers, one has none, one is shadow-only).

## Acceptance criteria

For **this** planning slice (4.ACCOUNT-MODEL-9):

- The doc at `docs/slices/phase-4/account-billing-rescope-plan.md` exists, is well-formed Markdown, and contains every section in the brief.
- No other repo file is touched. `git diff --name-only` shows exactly one new path under `docs/slices/phase-4/`.
- No commits until explicit user approval.

For each **implementing** slice (4.ACCOUNT-MODEL-9a → 9d):

- Ships exactly the scope listed above (one migration + the named code/test changes).
- Migration is idempotent against re-application; backfill safety check aborts on count mismatch.
- `npm run lint:migrations`, `npm run typecheck`, `npm run lint` pass; full Jest suite passes (new + pre-existing).
- The slice's commit message inlines its rollback recipe.
- **Deduction parity is proven:** post-cutover, charging an account leaves the same counters the equivalent user charge left pre-cutover; no path double-deducts or double-charges; the atomic row-lock check-and-write is preserved verbatim under the new key.
- Every existing billing behavior is preserved end-to-end: a run still deducts flat 1 task, test runs still skip, exhaustion still fail-closes — only the owning ledger moves from user to account.

## Boundaries (confirmed)

This planning slice does **not** change:

- Any existing migration, RLS policy, source file, or test.
- Any Stripe configuration (none exists to change).
- The README, roadmap, rule doc, `database-security.md`, or any other existing doc.
- Ownership of `integrations` / `workflows` / `workflow_runs` (Phase B owns these; untouched).
- Any account switcher / team / org UI (Phase D).
- The current working-tree state on the branch.

No code is pushed.

## Files in this planning slice

| Path | Action |
|---|---|
| `c:\Users\marcu\source\repos\ChainReactV2\docs\slices\phase-4\account-billing-rescope-plan.md` | Create (this doc) |

No other files touched.
