# 4.ACCOUNT-MODEL-4 — Account ID Cutover Plan (planning doc only)

## Context

The V2 account ownership model is ratified at [`docs/rules/account-ownership-model.md`](../../rules/account-ownership-model.md) and the Phase A foundation (accounts + memberships + signup trigger) shipped at commit `5831a73d` per the implementation contract at [`docs/slices/phase-4/account-model-foundation-plan.md`](./account-model-foundation-plan.md).

Phase A added the ownership root without touching the hot tables. **This slice plans Phase B — the cutover that re-scopes `workflows`, `integrations`, and `workflow_runs` from per-user ownership to per-account ownership** so that the rest of V2 (Phase 5 AI agent, Phase 6 engine hardening, Phase 7 billing) is built against the account model from day one.

The cutover is the most invasive schema change in V2's pre-launch lifetime. Done wrong it breaks workflow CRUD, OAuth, the execution engine, run history, billing, and RLS — six high-traffic surfaces at once. Done right it's invisible to users and unlocks every Phase 5+ slice. This plan picks the lowest-risk sequence and names exactly which behavior changes in which slice.

This document is a **planning doc only**. Producing it is the deliverable of slice 4.ACCOUNT-MODEL-4. The cutover implementation lands across the four subsequent slices (4.ACCOUNT-MODEL-5 through 4.ACCOUNT-MODEL-8) named in the sequencing section, each gated by their own approval.

## Current state after 4.ACCOUNT-MODEL-3

After commit `5831a73d`:

- `accounts` + `account_memberships` tables exist; every existing user has exactly one personal account + one owner membership; `handle_new_user` creates them at signup atomically.
- `accounts.owner_user_id` is `ON DELETE RESTRICT`; the future user/account deletion flow is the only legitimate removal path. Test/script teardown paths pre-clear `account_memberships` + `accounts` before `auth.admin.deleteUser`.
- `repositories/accounts.ts`, `repositories/accountMemberships.ts`, `services/accounts/ensurePersonalAccount.ts`, and `contracts/accounts.ts` exist but **are not imported by any production code path** — only by the 6 test files in slice -3.
- Every hot table is still `user_id`-owned with `auth.uid() = user_id` RLS:
  - `workflows`: `user_id NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`. RLS SELECT/INSERT/UPDATE/DELETE on `user_id`. Compound index `(user_id, updated_at DESC) WHERE state <> 'deleted'`.
  - `workflow_revisions`: `user_id` denormalized for RLS efficiency; cascades from workflow.
  - `integrations`: `user_id` + the compound unique `(user_id, provider, provider_account_id) WHERE disconnected_at IS NULL` that supports multi-account-per-provider.
  - `workflow_runs`: `user_id NOT NULL`. RLS SELECT only (writes are service-role). Multiple indexes: `(workflow_id, started_at DESC)`, `(user_id, started_at DESC)`, billing-expiry partial.
  - `trigger_resources`: `user_id` for RLS + `workflow_id` cascade. Also has an existing `account_id text` column — but it stores the **provider** account id (Slack team_id, etc.), not the V2 account. Naming collision to resolve at cutover.
- Execution engine derives `userId` from `workflow.userId` at entry, threads it through to billing + handlers. OAuth dispatcher reads `userId` from the signed state JWT and writes `integrations.user_id`. Billing gate is `userId`-keyed end-to-end (RPC `p_user_id`).
- `repositories/accounts.ts:ensurePersonalAccountServiceRole` exists and is the canonical way to resolve a user's personal account.

## Cutover principles

These are non-negotiable for every per-table slice that follows.

1. **Account is the owner; user is provenance.** After cutover, ownership reads/writes go through `account_id`. The original `user_id` survives only as the appropriate provenance column (`created_by_user_id` on workflows, `connected_by_user_id` on integrations, `triggered_by_user_id` on workflow_runs).
2. **One slice per hot table.** Per the confirmed sequencing decision: foundation slice adds columns + backfill + dual RLS; then one cutover slice each for integrations, workflows, workflow_runs. No mega-slices.
3. **Foundation slice changes no application code, but adds DB-level compat triggers.** The repositories, OAuth dispatcher, engine, and routes do not change in this slice. Existing INSERT paths still supply `user_id` and never supply `account_id` / `created_by_user_id` / `connected_by_user_id`. To make those inserts continue to succeed against new NOT NULL columns, the foundation slice ships **BEFORE INSERT compat triggers** on workflows / integrations / workflow_runs that derive the missing values from `NEW.user_id` (or, for runs, from the owning workflow). Per-table cutover slices later supply the values directly from updated code paths; the compat trigger no-ops in that case and is dropped at the end of each table's cutover slice. Rollback = drop the added columns + provenance + triggers + policies. See §"Recommended sequencing → 4.ACCOUNT-MODEL-5" + §"Backfill strategy" for the exact compat-trigger shape.
4. **Per-table cutover is atomic within its slice.** Each cutover slice flips RLS, switches readers/writers, and drops the `user_id` ownership column in one slice. No dual-write transitional state across slices — V2 is pre-launch, no production traffic to protect.
5. **Workflows can only use integrations from their own account.** Enforced at the engine's integration-resolution boundary: the engine looks up integrations by `(workflow.account_id, provider)`, never by `(workflow.created_by_user_id, provider)`. Cross-account use is an action-level failure, not a runtime crash.
6. **Default-account resolution is by-personal-account, no switcher.** Throughout Phase B, "this user's account" means "this user's personal account" via `getPersonalAccountForUser`. The switcher UI ships in a later slice and adds an `active_account_id` resolver step *in addition to* the default, not as a replacement.
7. **Billing keeps user-scoped.** Phase B does not touch `user_billing`, the deduct/reserve/reconcile RPCs, or the billing gate. The engine continues to thread `workflow.created_by_user_id` to the billing gate. Phase C re-scopes billing to `account_id`.
8. **No reader silently crosses account boundaries.** Every read after a per-table cutover scopes by account. The engine never resolves a workflow or integration by `user_id` after that table is cut over.

## Tables in scope

Three core ownership tables get `account_id` columns and become the authoritative read/write scope:

- **workflows** (slice -7)
- **integrations** (slice -6, first because of principle 5)
- **workflow_runs** (slice -8)

Three adjacent tables get RLS rewritten to join through their owning workflow (no new `account_id` column on these — they inherit scope):

- **workflow_revisions** (RLS joins through `workflows.account_id`).
- **trigger_resources** (RLS joins through `workflows.account_id`). **The existing `trigger_resources.account_id text` column is left untouched.** It stores the *provider* account id (Slack team_id, Notion workspace, HubSpot portal, etc.) and is referenced across the repository, every trigger lifecycle/activation/deactivation service, the trigger dispatcher, the polling/scheduled cron, ~20+ per-provider trigger handlers, and dozens of tests. Renaming it would violate the "no application code change" principle of the foundation slice — every consumer would have to be updated in the same slice. The two columns coexist: `trigger_resources.account_id` (text, provider account) is on a different table from `workflows.account_id` / `integrations.account_id` / `workflow_runs.account_id` (uuid, V2 account), and they're not confusable in practice because they're never accessed together. The naming overlap is a tolerable cosmetic wart, not a correctness risk. A rename to `trigger_resources.provider_account_id` is a deferred follow-up that can land any time (or never) without blocking Phase B; see "Risks and open questions" for the audit note.
- **workflow_files** (RLS joins through `workflows.account_id`).

## Tables explicitly out of scope

Out of Phase B; documented here so a future slice author doesn't accidentally pull them in:

- **user_billing, task_usage_events, ai_cost_events, billing_shadow_comparisons, task_overage_events, pack_purchases** — all billing-shaped. Phase C re-scopes via `account_billing`.
- **notifications** — stays user-delivered. Per rule doc §12, notifications go to a person, not an account; Phase B does not change that. Phase D will reconsider when team-account UI ships.
- **builder_agent_threads** — per-user, per-workflow threading is correct as-is; user reads only their own threads. Can be re-scoped in a later UX slice if team-level chat history is needed.
- **hubspot_app_subscriptions, hubspot_subscription_refs** — system tables for shared provider subscriptions; service-role only; not user-readable. No cutover needed.
- **oauth_states** — ephemeral system table for OAuth nonces; service-role only. No cutover needed.
- **webhook_event_dedup** — system table, service-role only.
- **accounts, account_memberships** themselves — already account-scoped; no change.

## Recommended sequencing

**Four slices, ordered. Each gates the next.**

### Slice 4.ACCOUNT-MODEL-5 — Foundation (additive at the code layer, compat-triggered at the DB layer)

One migration. No application code change. Existing repositories, routes, OAuth dispatcher, and engine continue to insert via `user_id` only; the migration ships BEFORE INSERT compat triggers so those inserts auto-populate the new columns.

**Migration sequence (single transaction):**

1. **Add columns nullable** (so the ALTER doesn't fail on existing rows that don't have values yet):
   - `workflows`: `account_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT`, `created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL`.
   - `integrations`: `account_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT`, `connected_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL`.
   - `workflow_runs`: `account_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT`, `triggered_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL`.
2. **Backfill** every existing row via the personal-account-per-user mapping from slice -3 (see §"Backfill strategy"). For `workflow_runs.triggered_by_user_id`, backfill to NULL — see backfill section for the rationale.
3. **Add compat triggers** (BEFORE INSERT, FOR EACH ROW) on workflows / integrations / workflow_runs that derive `account_id` and the provenance columns from existing values when the caller doesn't supply them. Exact SQL in §"Backfill strategy" below. The triggers are guarded by `IF NEW.<col> IS NULL` so they no-op once per-table cutover slices start inserting the columns directly.
4. **Add a safety-check assertion** in the migration (a `DO $$ ... RAISE EXCEPTION IF (SELECT count(*) FROM <table> WHERE account_id IS NULL) > 0 $$;` block per table) so the migration aborts if any backfill row got missed.
5. **Add NOT NULL** on `account_id` on all three tables. Safe at this point because (a) backfill populated every existing row, (b) compat triggers populate it for any concurrent INSERT during the migration, (c) the safety check just proved zero NULLs.
6. **Add account-membership RLS policies SIDE-BY-SIDE** with the existing user_id policies (named distinctly, e.g. `workflows_select_account_member`). Postgres OR-combines same-op policies; both predicates work during the transition.
7. **Add composite indexes** the per-table slices will need: `workflows (account_id, updated_at DESC) WHERE state <> 'deleted'`; `integrations (account_id, provider, provider_account_id) WHERE disconnected_at IS NULL` (additive alongside the existing user-scoped unique — both indexes coexist until slice -6 drops the old one); `workflow_runs (account_id, started_at DESC)`; defensive `account_memberships_user_id_idx (user_id)` to support the membership-join RLS predicate.

**What the foundation slice does NOT change:**

- No application code. Repositories, OAuth dispatcher, engine, routes, builder pages — all unchanged.
- No column is dropped. No existing RLS policy is dropped. No existing index is dropped.
- No `trigger_resources` column is renamed — see "Tables in scope" for the rationale.

**Verification (covered by the slice's tests, see §"Test plan"):**

- Every row in each table has `account_id` populated.
- Every `account_id` resolves to a real `accounts` row.
- Old user_id RLS still works; new account-membership RLS works for the same caller.
- **The existing repositories' INSERT paths (`workflows.create({ userId, name })`, `integrations.upsertActive({ userId, provider, ... })`, `workflowRuns.createWorkflowRunStart({ userId, workflowId, ... })`) succeed against the new NOT NULL columns** — the compat trigger fills them in. This is the load-bearing assertion that this slice ships safely.

**Compat trigger lifecycle.** Each per-table cutover slice (-6 / -7 / -8) drops its table's compat trigger as the final step, AFTER the repository is updated to supply `account_id` directly. The trigger is harmless until then because its body is `IF NEW.account_id IS NULL THEN ... END IF;` — once callers always supply the value, the trigger no-ops, but dropping it removes the per-INSERT lookup overhead. The slice-by-slice drop order is documented in each cutover slice's section below.

### Slice 4.ACCOUNT-MODEL-6 — Integrations cutover (first because of principle 5)

- `repositories/integrations.ts`: replace `listActiveByUser(userId)` with `listActiveByAccount(accountId)`. Replace `getActiveForExecution(userId, provider, providerAccountId)` with `getActiveForExecution(accountId, provider, providerAccountId)`. `upsertActive` takes `accountId` + `connectedByUserId` instead of `userId`. `updateTokens` and `markDisconnected` are keyed on `(accountId, provider, providerAccountId)` or by row id.
- OAuth dispatcher (`services/oauth/dispatcher.ts`): resolve `accountId` from `getPersonalAccountForUser(userId)` at connect time; bind into the signed state JWT alongside `userId`. Callback consumes `accountId` from the JWT and passes it to `upsertActive`.
- OAuth callback route + token-ingest route: thread `accountId` from the JWT, not from the session.
- Execution engine handlers: change every `getActiveForExecution(userId, provider, ...)` call site to `getActiveForExecution(workflow.account_id, provider, ...)`. Workflow row already has `account_id` from the foundation slice.
- Integrations list page: load by `account_id` (currently the user's personal account; future switcher slice substitutes the active account).
- RLS: drop the user-id-scoped SELECT/INSERT/UPDATE/DELETE policies on `integrations`; leave only the account-membership SELECT (writes stay service-role through the dispatcher).
- Drop `integrations.user_id` (column). The compound unique `(user_id, provider, provider_account_id) WHERE disconnected_at IS NULL` is replaced by the account-scoped equivalent added in the foundation slice; drop the old one in the same migration.
- Rewrite `tests/unit/repositories/integrations.test.ts` + `tests/unit/repositories/integrations-getActiveForExecution.test.ts` for the new signatures.
- **Drop the foundation slice's `integrations_compat_set_account` trigger** at the end of this slice's migration. Repository now supplies `account_id` + `connected_by_user_id` directly; the trigger has become redundant.

### Slice 4.ACCOUNT-MODEL-7 — Workflows cutover

- `repositories/workflows.ts`: `create({ accountId, createdByUserId, name })`. Replace `listByUser(userId)` with `listByAccount(accountId)`. `getById`/`getByIdServiceRole` unchanged in signature but the returned `WorkflowRecord` exposes `accountId` + `createdByUserId` (drop the `userId` field). `applyTransition` and the update mutators stay keyed on workflow id.
- API routes under `app/api/workflows/**`: resolve `accountId` from the caller's personal account once at route entry; pass to repository.
- Builder pages (`app/workflows/page.tsx`, `app/workflows/[id]/page.tsx`): same — resolve account from session, scope all reads by account.
- React Agent: `services/ai/**` workflow-touching paths receive `accountId` from the calling route. The agent itself does not need to know about accounts beyond passing the value through.
- Lifecycle orchestrator: no signature change (workflow id is still the natural key for activate/deactivate); internal reads use account scope where applicable.
- Execution engine: read `workflow.account_id` from the loaded workflow row. Thread `accountId` to handlers + (eventually) billing.
- RLS: drop user-id-scoped policies on `workflows`; leave only the account-membership policies.
- Drop `workflows.user_id`.
- `workflow_revisions` RLS: rewrite to `EXISTS (SELECT 1 FROM workflows w INNER JOIN account_memberships am ON am.account_id = w.account_id WHERE w.id = workflow_revisions.workflow_id AND am.user_id = auth.uid())`. Drop `workflow_revisions.user_id` (it was denormalized for the old RLS only).
- Rewrite `tests/unit/repositories/workflows.test.ts`.
- **Drop the foundation slice's `workflows_compat_set_account` trigger** at the end of this slice's migration. Repository now supplies `account_id` + `created_by_user_id` directly.

### Slice 4.ACCOUNT-MODEL-8 — Workflow_runs cutover (+ trigger_resources, workflow_files RLS)

- `repositories/workflowRuns.ts` + `repositories/workflowRunsLifecycle.ts`: `recordRun({ workflowId, accountId, triggeredByUserId, ...})`. `createWorkflowRunStart({ accountId, ... })`. `listByWorkflow(workflowId)` unchanged in signature (workflow id is the natural key). `sweepStaleRunningWorkflowRuns` reads by account scope. `getWorkflowRunForBilling` returns `accountId` + `triggeredByUserId` in addition to existing billing projection.
- Execution engine: write `account_id` to the workflow_runs row from `workflow.account_id`. Populate `triggered_by_user_id`:
  - Manual run (user clicked Run) → caller's userId.
  - Retry → caller's userId.
  - Webhook / polling / cron / scheduled → NULL.
- Run history UI: read by account scope through the existing workflow-id key path; RLS handles visibility.
- Notification fanout (`services/notifications/notifyWorkflowFailure.ts`): unchanged at this slice. Notifications still go to users (per principle 7 + the out-of-scope list).
- RLS: drop user-id SELECT policy on `workflow_runs`; leave account-membership policy.
- Drop `workflow_runs.user_id`.
- `trigger_resources` RLS: rewrite to join through `workflows`. No `account_id` column on `trigger_resources` itself.
- `workflow_files` RLS: same — join through `workflows`.
- Billing gate: still receives `workflow.created_by_user_id` (renamed from `workflow.user_id`). Behavior unchanged. Phase C re-keys.
- Rewrite `tests/unit/repositories/workflowRuns.test.ts`.
- **Drop the foundation slice's `workflow_runs_compat_set_account` trigger** at the end of this slice's migration. Engine now supplies `account_id` directly from `workflow.account_id` and `triggered_by_user_id` per source.

## Backfill strategy

In the foundation slice, in a single migration, in order:

### 1. Backfill existing rows

```sql
-- workflows
UPDATE public.workflows w
   SET account_id = a.id,
       created_by_user_id = w.user_id
  FROM public.accounts a
 WHERE a.type = 'personal'
   AND a.owner_user_id = w.user_id
   AND w.account_id IS NULL;

-- integrations
UPDATE public.integrations i
   SET account_id = a.id,
       connected_by_user_id = i.user_id
  FROM public.accounts a
 WHERE a.type = 'personal'
   AND a.owner_user_id = i.user_id
   AND i.account_id IS NULL;

-- workflow_runs (triggered_by_user_id stays NULL for legacy rows — see below)
UPDATE public.workflow_runs r
   SET account_id = a.id
  FROM public.accounts a
 WHERE a.type = 'personal'
   AND a.owner_user_id = r.user_id
   AND r.account_id IS NULL;
```

### 2. Add compat triggers so existing INSERTs continue to work

The foundation slice does not change application code, but the existing `workflows.create()`, `integrations.upsertActive()`, and `workflowRuns.createWorkflowRunStart()` insert paths only supply `user_id`. Without compat triggers, the NOT NULL on `account_id` (added in step 3 below) would break the next INSERT from those code paths. The triggers are guarded by `IF NEW.<col> IS NULL` so they no-op once the per-table cutover slices start inserting the columns directly; each cutover slice drops its trigger as its final step.

```sql
-- workflows compat trigger
CREATE OR REPLACE FUNCTION public.workflows_compat_set_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.account_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO NEW.account_id
      FROM public.accounts
     WHERE type = 'personal'
       AND owner_user_id = NEW.user_id;
  END IF;
  IF NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workflows_compat_set_account
  BEFORE INSERT ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.workflows_compat_set_account();
```

```sql
-- integrations compat trigger (same shape, different provenance column)
CREATE OR REPLACE FUNCTION public.integrations_compat_set_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.account_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO NEW.account_id
      FROM public.accounts
     WHERE type = 'personal'
       AND owner_user_id = NEW.user_id;
  END IF;
  IF NEW.connected_by_user_id IS NULL THEN
    NEW.connected_by_user_id := NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER integrations_compat_set_account
  BEFORE INSERT ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.integrations_compat_set_account();
```

```sql
-- workflow_runs compat trigger (derives account_id from the owning workflow;
-- does NOT auto-populate triggered_by_user_id — see below)
CREATE OR REPLACE FUNCTION public.workflow_runs_compat_set_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.account_id IS NULL AND NEW.workflow_id IS NOT NULL THEN
    SELECT w.account_id INTO NEW.account_id
      FROM public.workflows w
     WHERE w.id = NEW.workflow_id;
  END IF;
  -- triggered_by_user_id stays as supplied by the caller (NULL when not set).
  -- The engine populates it correctly per source after slice -8 cutover; before
  -- that, legacy inserts leave it NULL, which is the honest backfill semantic.
  RETURN NEW;
END;
$$;

CREATE TRIGGER workflow_runs_compat_set_account
  BEFORE INSERT ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.workflow_runs_compat_set_account();
```

**Edge case — user has no personal account.** Per the slice -3 invariant, every user has one. If a row's `user_id` points at a user without a personal account, the trigger's SELECT INTO returns NULL, `NEW.account_id` stays NULL, and the NOT NULL constraint (added in step 3) fails the insert with a clear error. That's correct behavior — an invariant violation should surface, not be silently swallowed.

**Edge case — workflow_runs inserted before its owning workflow exists.** The trigger reads `workflows.account_id` by `workflow_id`. If the workflow doesn't exist, the SELECT returns no row, `account_id` stays NULL, and NOT NULL fails the insert. This is correct — a run without a workflow was always a foreign-key violation; the FK on `workflow_id` would also fire.

### 3. Add NOT NULL + safety check

```sql
DO $$
BEGIN
  IF (SELECT count(*) FROM public.workflows WHERE account_id IS NULL) > 0
     OR (SELECT count(*) FROM public.integrations WHERE account_id IS NULL) > 0
     OR (SELECT count(*) FROM public.workflow_runs WHERE account_id IS NULL) > 0
  THEN
    RAISE EXCEPTION 'foundation backfill incomplete — refusing to add NOT NULL constraint';
  END IF;
END;
$$;

ALTER TABLE public.workflows       ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE public.integrations    ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE public.workflow_runs   ALTER COLUMN account_id SET NOT NULL;
```

If the safety check fails, the migration rolls back atomically (the entire migration is one transaction). The slice author investigates whether the slice -3 personal-account invariant was somehow violated and fixes the data before re-applying.

**`triggered_by_user_id` backfill: NULL for legacy rows, not `r.user_id`.** Legacy `workflow_runs.user_id` was always equal to the workflow owner regardless of trigger source. Backfilling it into `triggered_by_user_id` would assert a contract the column doesn't carry ("a human triggered this") for runs that were actually webhook / polling / cron. NULL is the honest backfill: "we don't know who triggered this legacy run." Going forward, the engine populates it correctly per source.

**Workflow / integration mismatch case.** Pre-cutover, a workflow's `user_id` and its integrations' `user_id` were always the same (V2 today is single-user; cross-user mutation paths don't exist). The migration's backfill maps both to the same personal account. There is no asymmetric V1 data here — that asymmetry was a V1 problem the rule doc §"Risks and open questions" surfaced for the hypothetical V1→V2 migration, not for V2's own data. Document the absence-of-mismatch in the migration comment; if a future audit ever finds one, it's a bug to investigate, not a state to plan for.

**Backfill idempotency.** Re-running the UPDATE statements produces zero changes because `WHERE … IS NULL` filters out already-populated rows. The migration is safe to re-apply (e.g., if the dev DB is reset and migrations replay).

**Backfill safety check** (run after the UPDATEs, before the NOT NULL):

```sql
-- expect 0
SELECT count(*) FROM public.workflows WHERE account_id IS NULL;
SELECT count(*) FROM public.integrations WHERE account_id IS NULL;
SELECT count(*) FROM public.workflow_runs WHERE account_id IS NULL;
```

If non-zero, the NOT NULL add fails, the transaction rolls back, and the slice's author investigates whether the personal-account invariant from slice -3 was somehow violated (it shouldn't be).

## RLS migration strategy

Two phases.

### Foundation slice (-5) — dual predicates side by side

Add NEW policies named with `_account_member` suffix; **do not drop or modify the existing `_own` policies**. Postgres OR-combines same-operation policies, so a query that satisfies either predicate succeeds.

Example for `workflows` SELECT:

```sql
-- existing — keep as-is
CREATE POLICY workflows_select_own ON public.workflows
  FOR SELECT USING (auth.uid() = user_id);

-- NEW in foundation slice
CREATE POLICY workflows_select_account_member ON public.workflows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflows.account_id
    )
  );
```

Same shape for INSERT / UPDATE / DELETE on `workflows`, and the equivalent set on `integrations` and `workflow_runs` (workflow_runs has SELECT only per current state). For tables that get cut over by RLS-join only (`workflow_revisions`, `trigger_resources`, `workflow_files`), the join-through-workflows membership predicate is added side by side with the existing `auth.uid() = user_id`.

### Per-table cutover slices (-6, -7, -8) — drop the `_own` policies, keep `_account_member` only

In the same migration as each table's cutover:

- `DROP POLICY <table>_<op>_own ON public.<table>;` for every operation.
- (Optional, recommended) `ALTER POLICY` rename of the surviving `_account_member` to drop the suffix once it's the only policy.

After all three cutover slices, the only RLS policies on workflows / integrations / workflow_runs are account-membership. The membership join is the only authorization check the database performs.

### Index coverage

The membership-join predicate hits `account_memberships(user_id, account_id)`. The composite PK `(account_id, user_id)` covers `user_id = auth.uid() AND account_id = <table>.account_id` lookups efficiently. **Add a supporting index** `account_memberships_user_id_idx` if EXPLAIN shows the planner not picking up the PK in reverse-order (the PK's first column is `account_id`, not `user_id`). Add this in the foundation slice as a defensive measure.

## Repository / service / API strategy

Three principles for the per-table cutover slices:

1. **Same module, new signatures.** Repositories keep their existing file paths and module names. Function signatures change — `userId` parameters become `accountId` parameters where the function expresses ownership; provenance parameters (`createdByUserId`, `triggeredByUserId`) are explicit and optional where the existing user_id was the de facto provenance. No new repository files unless a genuinely new concept appears.
2. **Account resolution at route entry, not in repositories.** API routes call `getPersonalAccountForUser(userId)` once at route entry (or read it from the future active-account state when the switcher ships) and pass `accountId` down. Repositories do not resolve accounts; they take an `accountId` parameter as data.
3. **Engine reads `account_id` from the workflow row.** The execution engine never resolves an account from a user — it reads `workflow.account_id` from the loaded workflow and threads it through to handlers + (later) billing.

Renames and signature changes per slice are listed in the sequencing section above. No new repository modules are created — every change happens inside the existing `repositories/{workflows,integrations,workflowRuns,workflowRunsLifecycle,accountMemberships,accounts}.ts`.

`services/accounts/ensurePersonalAccount.ts` becomes wired into the route entry-resolution path in slice -7 (the workflows cutover, which is the first slice where an end-user-facing API route needs an `accountId`). Before that, it remains the safety-net helper from slice -3.

## Builder / React Agent implications

The builder UI (`app/workflows/page.tsx`, `app/workflows/[id]/page.tsx`) and every page under the builder shell get an `accountId` resolved at the page boundary (server component path) and passed down to client components as a prop. The page resolves it via `getPersonalAccountForUser` until the switcher ships.

**The React Agent does not need to learn about accounts.** It consumes workflow data through repositories and writes patches through services; both gain `accountId` parameters but the agent's prompt-construction and apply logic don't reference the account. The agent is a data-in / patches-out transform; the calling route owns scope.

**Critical UI guardrail.** Until the switcher ships, every page links to and lists workflows in "the user's personal account." Workflows authored in the personal account before cutover stay there post-cutover (the backfill maps each user's existing workflows to their personal account). No URL changes, no slug changes — `/workflows/[id]` continues to resolve workflows by id; the account scope is invisible to the URL.

## OAuth / integration implications

The OAuth dispatcher's signed state JWT gains a single field: `accountId`. Resolved at connect time from the user's personal account; signed; consumed at callback; passed to `upsertActive` alongside `userId` (which becomes `connected_by_user_id` provenance).

**Token-ingest providers** (Trello, future API-token providers) follow the same change — their state JWT carries `accountId`.

**Future switcher implication, documented now:** when the active-account-resolver ships, the connect route resolves `accountId` from the user's currently-active account, not the personal account. This lets users connect Outlook–marcus@company.com to the Acme team account by switching to Acme before clicking Connect. The dispatcher contract doesn't change; only the resolver does. No work needed in Phase B for this.

**Cross-account integration prevention (the load-bearing rule).** After slice -6, the engine resolves integrations by `(workflow.account_id, provider)`. If a workflow tries to use a provider it has no integration for, the action fails with the existing "no integration found" error path. There is no fallback to "other accounts the user is a member of" — that's the principle 5 invariant. Test this explicitly in slice -6 by setting up a workflow on account A and an integration on account B and asserting the workflow's action fails with `no integration found for account=A provider=<x>`.

## Execution / run-history implications

Execution engine changes are concentrated in three call sites:

- **Workflow load** (line 121 in `services/execution/engine.ts`): unchanged in shape. `getByIdServiceRole(workflowId)` returns a record that now exposes `accountId` + `createdByUserId` instead of `userId`. The engine reads `workflow.accountId` for downstream calls and `workflow.createdByUserId` for the (Phase B) billing-gate call.
- **Integration resolution** (in each handler): swap `getActiveForExecution(userId, ...)` → `getActiveForExecution(accountId, ...)`. Mechanical change; same number of arguments.
- **Run row write**: `createWorkflowRunStart({ workflowId, accountId, triggeredByUserId, ... })`. Stop writing `user_id`.

The engine never crosses account boundaries because workflow and run share the same account_id. The "implicit one-user-one-tenant" assumption is replaced by an explicit "this run belongs to this account" assertion.

**Stale-run sweep** (`services/execution/staleWorkflowRunSweep.ts`): scopes by account where it matters. The sweep doesn't care about account scope for the sweep itself (it's run by cron, service-role), but the rows it touches now carry `account_id` and the cron's logging should include it for forensics.

**HITL pause/resume**: V2 doesn't ship HITL yet (Phase 6 deliverable). When it lands, the resume API will be account-scoped — but that's Phase 6, not Phase B. Document so the Phase 6 author doesn't miss the principle.

**Run history**: `/api/workflows/[id]/executions` continues to work because RLS on `workflow_runs` gates by account membership and the workflow id is the natural key. No URL changes.

## Billing implications

**Phase B does not change billing.** The billing gate continues to be keyed on `userId`. The engine threads `workflow.createdByUserId` (renamed from the dropped `workflow.userId`) to the billing gate. Reserve/reconcile RPCs continue with `p_user_id`. `user_billing` rows continue to be 1:1 with users.

The integration test `tests/integration/billing/reserveReconcileEngine.dev.test.ts` continues to work because it operates on a single user (whose personal account is the only account that matters). The cutover slices' workflow / integration / workflow_runs changes do not regress billing — billing reads neither `account_id` nor `user_id` from those tables; it reads `userId` from the engine's call signature.

**Phase C handles billing cutover.** That's a separate planning slice (`account-billing-cutover-plan.md`, not in scope here). Phase C will:
- Add `account_billing` keyed on `account_id`.
- Backfill from `user_billing(user_id)` via personal accounts.
- Re-key the deduct/reserve/reconcile RPCs to `p_account_id`.
- Update the billing gate signature.
- Re-point Stripe customer attachment from `user_billing.user_id` to `account_billing.account_id`.

Phase B's only billing-shaped change is renaming `workflow.user_id` → `workflow.created_by_user_id` everywhere the billing gate references it. The billing gate continues to receive the right userId; the caller's variable name is the only change.

## Test plan

Per-slice test scope.

### Foundation slice (-5)

- `tests/integration/migrations/account-id-foundation-backfill.test.ts` — for each of workflows / integrations / workflow_runs: assert every existing row has `account_id` populated; assert `account_id` resolves to a personal account whose `owner_user_id` matches the row's pre-cutover `user_id`; assert running the backfill UPDATE again produces zero changes (idempotency).
- `tests/integration/security/account-id-foundation-dual-rls.test.ts` — for workflows + integrations + workflow_runs: user A (with workflow / integration / runs from before cutover) can still SELECT via the old user_id RLS, AND can SELECT via the new account-member RLS. Both work simultaneously.
- `tests/integration/migrations/account-id-foundation-compat-trigger.test.ts` — **the load-bearing assertion of this slice**. For each table:
  - Call the existing repository signature with no `account_id` / provenance parameters:
    - `repositories/workflows.ts:create({ userId: A, name: 'X' })` → assert the row lands; assert `account_id` equals A's personal account; assert `created_by_user_id` equals A; assert `user_id` still equals A (unchanged in this slice).
    - `repositories/integrations.ts:upsertActive({ userId: A, provider: 'slack', ... })` → assert the row lands; assert `account_id` equals A's personal account; assert `connected_by_user_id` equals A.
    - `repositories/workflowRuns.ts:createWorkflowRunStart({ userId: A, workflowId: <wf>, ... })` → assert the row lands; assert `account_id` equals the workflow's `account_id` (which equals A's personal account).
  - Repeat each insert with `account_id` explicitly supplied → assert the trigger no-ops (the supplied value wins; trigger does not overwrite).
  - Insert a `workflow_runs` row with `workflow_id` pointing at a non-existent workflow → assert the FK fires (engine never does this; defense-in-depth).
- All pre-existing test files continue to pass (non-regression). Run the full Jest suite. Specifically, every existing test that exercises `workflows.create`, `integrations.upsertActive`, or `workflowRuns.createWorkflowRunStart` (route tests, OAuth dispatcher tests, execution-engine tests, OAuth-callback e2e walkthroughs) must pass with **no signature changes** in this slice.

### Integrations cutover (-6)

- `tests/integration/security/integrations-account-rls.test.ts` — user A's integration is invisible to user B even when both are members of different accounts. User A's integration is invisible from user A's session when looking through another account's scope.
- `tests/integration/features/oauth-callback-account-id.test.ts` — OAuth callback writes `account_id` from the JWT state to the integrations row; `connected_by_user_id` carries the user's id; the (deleted) `user_id` column no longer exists.
- `tests/integration/features/cross-account-integration-rejection.test.ts` — a workflow on account A tries to use an integration owned by account B; the engine's handler resolution returns no match; the action fails with the standard "no integration" error (NOT a crash, NOT a silent fallback). This is the principle-5 enforcement test.
- `tests/unit/repositories/integrations.test.ts` + `integrations-getActiveForExecution.test.ts` — rewrite for the new account-keyed signatures.

### Workflows cutover (-7)

- `tests/integration/security/workflows-account-rls.test.ts` — user A's workflows are invisible to user B; user A can SELECT/INSERT/UPDATE/DELETE only workflows owned by accounts they are a member of.
- `tests/integration/features/workflow-crud-account-scoped.test.ts` — full CRUD via the API routes: create / list / get / update name / update draft / activate / deactivate / soft-delete. All operations succeed for the workflow's account members and fail (404 / RLS-empty) for non-members.
- `tests/integration/features/workflow-revisions-account-rls.test.ts` — workflow_revisions inherit account scope via the workflow join.
- `tests/unit/repositories/workflows.test.ts` — rewrite for the new account-keyed signatures.

### Workflow_runs cutover (-8)

- `tests/integration/security/workflow-runs-account-rls.test.ts` — runs are visible to account members only.
- `tests/integration/features/run-history-account-scoped.test.ts` — `/api/workflows/[id]/executions` returns the workflow's runs for any account member; returns empty for non-members (RLS).
- `tests/integration/features/triggered-by-user-id-population.test.ts` — manual run sets `triggered_by_user_id = caller`; retry sets `triggered_by_user_id = caller`; webhook / polling / cron / scheduled runs set `triggered_by_user_id = NULL`. Asserts the engine's source-aware population.
- `tests/integration/features/trigger-resources-workflow-join-rls.test.ts` + `workflow-files-workflow-join-rls.test.ts` — these tables' RLS join through workflows correctly.
- `tests/unit/repositories/workflowRuns.test.ts` — rewrite for the new account-keyed signatures.

### Non-regression bar (all slices)

- `npm run lint:migrations` passes on every new migration.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npx jest` full suite — every pre-existing test continues to pass after each slice's cutover. Slices that change repository signatures rewrite the directly-affected unit tests in the same slice; tests further downstream (route tests, service tests) update only if they exercise the repository's signature directly.

## Rollout / rollback strategy

**Pre-launch.** V2 has no production users. Rollout is "apply migration to the dev/test Supabase project, run the full Jest suite, commit." There is no canary, no feature flag, no staged rollout. This is one of the few times a non-trivial schema change can land without a migration scheduler.

**Rollback per slice.**

- **Foundation slice (-5):** Drop the three compat triggers + their functions, drop the new `account_id` + provenance columns on workflows / integrations / workflow_runs, drop the new account-membership RLS policies, drop the new account-scoped indexes (including `account_memberships_user_id_idx`). The system continues to operate on the old user_id-only path because **no application code was changed**. `trigger_resources` is not modified by this slice and needs no rollback. **This slice is reversible end-to-end via a single forward-only revert migration.**
- **Integrations cutover (-6):** Rollback requires re-adding `integrations.user_id`, repopulating it from `integrations.connected_by_user_id`, re-adding the old RLS policies, and re-adding the old compound unique index. The repository, OAuth dispatcher, and handler changes all need a code revert. Not trivial but not surgical either — pre-launch with no production data, a `git revert` + a one-shot ALTER migration is enough.
- **Workflows cutover (-7):** Same shape as integrations. Re-add `workflows.user_id` + `workflow_revisions.user_id`, repopulate, re-add RLS, revert code.
- **Workflow_runs cutover (-8):** Same shape. Re-add `workflow_runs.user_id`, repopulate from `account_id` → account → owner_user_id (only safe because personal accounts have exactly one owner per the slice -3 invariant), re-add RLS, revert code.

**Each slice's commit message must include the rollback recipe inline** so a future operator doesn't have to reconstruct it from this doc.

**Migration ordering safety.** Each per-table cutover slice ships its own migration file. The migrations are forward-only; reverting code without reverting the migration leaves the database with dropped columns the old code expects. The acceptable revert path is: revert code AND apply a follow-up migration that re-adds the dropped columns + backfills. Document this in the slice plans.

## Risks and open questions

Flagged for resolution in the implementing slice or in a later phase. Not blockers for this planning slice.

- **Migration size for the foundation slice.** Adding three nullable columns + three provenance columns + three compat triggers + a safety check + NOT NULL toggles + four new RLS policies + multiple indexes in one migration is ~250 lines of SQL. Readable, but the largest single migration in the V2 repo to date. If review pushes back, split into one migration per table (-5a, -5b, -5c). Default position: one migration, because the backfill + compat-trigger + NOT NULL sequence benefits from a single atomic transaction.
- **trigger_resources.account_id naming overlap.** The existing `trigger_resources.account_id text` column stores the *provider* account id (Slack team_id, etc.) — distinct from the V2 `accounts.id uuid` that Phase B adds elsewhere. **This plan does NOT rename it.** The audit (grep `trigger_resources` across the repo) surfaces references in `repositories/triggerResources.ts`, every trigger lifecycle / dispatch / cron service, ~20+ per-provider trigger handlers (Discord, Slack, Gmail, Google Drive, Stripe, Shopify, HubSpot, Mailchimp, GitHub, Microsoft Outlook, Excel, OneDrive, Teams, Notion, Airtable, Trello, Monday, Dropbox, Facebook), and dozens of tests. A rename would violate the "no application code change" principle of the foundation slice. The two columns coexist on different tables with different types and different semantics; they're never accessed together. A future cosmetic rename to `provider_account_id` is a deferred follow-up that can land any time without blocking Phase B.
- **workflow_runs.triggered_by_user_id legacy backfill.** Legacy rows get NULL (the honest backfill). Any analytics / dashboard query that expects every run to have a triggerer will see NULLs for the entire pre-cutover history. Document in the slice -8 commit message; update any such query to handle NULL.
- **Compat-trigger per-INSERT overhead.** Each compat trigger does one indexed SELECT against `accounts` (or `workflows` for the run case) on every INSERT to the three tables. Negligible at V2 scale (single-row index hit on the personal-account unique partial index from slice -3); document for future profiling. Each per-table cutover slice drops its trigger when the repository starts supplying `account_id` directly, removing the overhead.
- **Account-membership index direction.** The composite PK on `account_memberships(account_id, user_id)` may not be efficient for the membership-join RLS predicate's `WHERE am.user_id = auth.uid() AND am.account_id = <table>.account_id` access pattern. Add a defensive `account_memberships_user_id_idx (user_id)` in the foundation slice. Verify with EXPLAIN on the dev DB in slice -5 before signing off.
- **Default-account resolution adds a per-request DB round-trip (only in cutover slices, not foundation).** Once the per-table cutover slices ship, every API route calls `getPersonalAccountForUser(userId)` once at entry. That's one extra index hit per request. Negligible at V2 scale; document as a candidate for caching (Phase 5+ active-account state) if profiling shows otherwise.
- **Phase 5 (AI agent) inheritance.** The React Agent's plan/apply flow runs through the workflows repository. The agent doesn't need to know about accounts, but the routes that invoke it must resolve and pass `accountId`. Slice -7 covers this; the Phase 5 plan author should confirm there's no agent-side cache that pre-dates account scope.
- **What happens to old Supabase JWTs after RLS flip.** During the per-table cutover slice's migration, the existing `_own` RLS policy is dropped. A request mid-flight that was authorized by the `_own` policy now needs to satisfy the `_account_member` policy instead. For pre-launch V2, no requests are mid-flight during a migration; for production, this is a 0–5s window where Supabase pgrest pool may have stale policy cache. Document as "apply migration during quiet window."
- **Notification scope.** Phase B keeps notifications user-delivered. If Phase D's team UI needs per-account notifications, that's a separate `notifications.account_id` addition slice. Captured as a deferred follow-up; no work here.
- **What if a row's user_id doesn't have a personal account?** The compat triggers' SELECT INTO returns NULL when no personal account exists for the user; `NEW.account_id` stays NULL; the NOT NULL constraint (added after the safety check) fails the insert with a clear error. The migration's own safety-check DO-block also fails the migration upfront if backfill produced any NULL rows. Both layers surface the slice -3 personal-account invariant violation rather than silently swallowing it.

## Acceptance criteria

For **this** planning slice (4.ACCOUNT-MODEL-4):

- The doc at `docs/slices/phase-4/account-id-cutover-plan.md` exists, is well-formed Markdown, and contains all 18 sections specified in the brief.
- No other repo files are touched. `git diff --name-only` shows exactly one new path under `docs/slices/phase-4/`.
- No commits made until explicit user approval.

For each **implementing** slice (4.ACCOUNT-MODEL-5 through 8):

- The slice ships exactly the scope listed in its sequencing section above (one migration plus the named repository / service / route changes plus the listed tests).
- The migration is idempotent against re-application.
- `npm run lint:migrations`, `npm run typecheck`, `npm run lint` all pass.
- The full Jest suite passes — both the new tests and every pre-existing test.
- The slice's commit message includes its rollback recipe (the migration that would re-add the dropped columns / policies + repopulate, plus the `git revert` SHA the code changes were made on).
- Every existing user-scoped behavior continues to work end-to-end. Specifically: a user can create a workflow, connect an integration, run the workflow, see the run in history, and be charged via the billing gate — without any change to the user-facing URLs or to the route response shapes.

## Follow-up slices

Ordered, with the dependencies each unblocks. None of these are scoped in this plan.

- **4.ACCOUNT-MODEL-5 — Foundation** (planned next). Gated by user approval of this plan.
- **4.ACCOUNT-MODEL-6 — Integrations cutover**. Gated by -5 shipped + verified.
- **4.ACCOUNT-MODEL-7 — Workflows cutover**. Gated by -6 shipped + verified.
- **4.ACCOUNT-MODEL-8 — Workflow_runs cutover + adjacent-table RLS**. Gated by -7 shipped + verified.
- **User / account deletion flow** (separate plan + slice). Independent of Phase B sequencing; can land any time after slice -3 and before Phase D ships its user-facing delete-account surface.
- **Phase C — account_billing cutover** (separate plan + slice sequence). Re-keys `user_billing` + reserve/reconcile RPCs + Stripe customer attachment to `account_id`. Depends on Phase B being complete (workflows + runs already account-scoped so the billing gate has an `accountId` to receive).
- **Phase D — Team / organization account types** (separate plan + slice sequence). Relaxes `accounts.type` and `account_memberships.role` CHECK constraints; introduces invitations + roles + switcher UI. Depends on Phase B + Phase C being complete so team/org accounts immediately have workflows + integrations + billing.
- **Phase E — Ownership transfer + leave** (separate plan + slice). Implements rule doc §14.
- **Active-account switcher UI** (separate slice; pairs with Phase D). Adds `user_profiles.active_account_id` with backfill defaulting to the user's personal account; the default-account resolver gains a precedence step.
- **Notifications account-scoping** (separate slice; gated by Phase D). Re-considers whether notifications should also gain an `account_id` once team-context notifications are needed.

## Boundaries (confirmed)

This planning slice does **not** change:

- Any existing migration file.
- Any pre-existing RLS policy.
- Any pre-existing source file.
- The README, the roadmap, the rule doc, `database-security.md`, or any other existing doc.
- The pre-existing dirty working-tree state on the current branch (`app/globals.css`, `components/app-shell/*`, untracked sibling files). All untouched.

## Files in this planning slice

| Path | Action |
|---|---|
| `c:\Users\marcu\source\repos\ChainReactV2\docs\slices\phase-4\account-id-cutover-plan.md` | Create (this doc) |

No other files touched.
