-- ChainReactV2 — workflow_runs account_id cutover (Slice 4.ACCOUNT-MODEL-8).
--
-- Phase B FINAL cutover per the plan at
-- docs/slices/phase-4/account-id-cutover-plan.md §"Slice 4.ACCOUNT-MODEL-8".
-- Flips workflow_runs from user_id ownership to account_id ownership and
-- rewrites the two remaining adjacent tables' RLS (trigger_resources,
-- workflow_files) to join through workflows.account_id. Application-code
-- cutover (engine run-write, repos, run-history reads) lands in the same
-- commit.
--
-- Order in this migration:
--   1. Drop the legacy user_id RLS policy on `workflow_runs`.
--   2. Drop the foundation slice's `workflow_runs_compat_set_account`
--      trigger + function (the engine now supplies account_id directly).
--   3. Drop the legacy user-scoped index `workflow_runs_user_idx`.
--   4. Drop `workflow_runs.user_id`.
--   5. Rewrite `trigger_resources` RLS: drop the _own (user_id) policies,
--      add account-membership policies that JOIN through workflows.account_id.
--      KEEP trigger_resources.user_id (denormalized provenance; ~20+ handlers
--      still write/read it) and trigger_resources.account_id (provider-account
--      TEXT — NOT the V2 account, NOT renamed).
--   6. Rewrite `workflow_files` RLS: same join-through-workflows pattern.
--      KEEP workflow_files.user_id (provenance + storage-path component).
--   7. Refresh the workflow_run_stats view COMMENT (now account-gated).
--
-- Post-migration state:
--   - `workflow_runs.account_id` is the authoritative owner (NOT NULL, FK to
--     accounts(id) ON DELETE RESTRICT — set by the foundation slice).
--   - `workflow_runs.triggered_by_user_id` carries actor provenance (the human
--     who manually ran / retried; NULL for webhook/polling/cron/scheduled/
--     system). NOT authorization.
--   - workflow_runs RLS reads scoped by account membership only
--     (workflow_runs_select_account_member, from the foundation slice).
--   - trigger_resources + workflow_files RLS scoped by account membership via a
--     JOIN through workflows.account_id.
--   - `workflow_runs.user_id` column does NOT exist.
--
-- Hard scope fences:
--   - No change to billing: user_billing / account_billing / task deduction /
--     reserve-reconcile RPCs / the billing gate keying are untouched. Billing
--     stays user-keyed in Phase B; the engine threads workflow.created_by_user_id.
--   - trigger_resources.account_id (text, provider account) NOT renamed.
--   - trigger_resources.user_id + workflow_files.user_id columns KEPT (now
--     denormalized provenance, no longer the RLS key).
--   - workflows + integrations ownership untouched (cut over in -7 / -6).
--
-- Rollback recipe (pre-launch, no prod data): git revert the code commit, then
-- a forward migration that re-adds workflow_runs.user_id (NOT NULL), backfills
-- it from accounts.owner_user_id via account_id (safe: personal accounts have
-- exactly one owner — slice -3 invariant), re-creates workflow_runs_user_idx,
-- re-creates the workflow_runs_select_own policy from 20260507000001, re-creates
-- the workflow_runs_compat_set_account trigger from 20260530000001, drops the
-- account-membership policies added here on trigger_resources/workflow_files,
-- and re-creates their _own policies from 20260507000000 / 20260512000000.

-- ── 1. Drop legacy user_id RLS policy on workflow_runs ──────────────────

DROP POLICY IF EXISTS workflow_runs_select_own ON public.workflow_runs;

-- workflow_runs_select_account_member (foundation slice) remains as the only
-- SELECT predicate. Writes stay service-role through the engine (no
-- user-facing write policies — default-deny, unchanged).

-- ── 2. Drop the foundation compat trigger ──────────────────────────────
--
-- The engine's createWorkflowRunStart / recordRun now supply account_id (from
-- workflow.account_id) + triggered_by_user_id directly. The trigger has become
-- a no-op; dropping it removes the per-INSERT lookup of the owning workflow.

DROP TRIGGER IF EXISTS workflow_runs_compat_set_account ON public.workflow_runs;
DROP FUNCTION IF EXISTS public.workflow_runs_compat_set_account();

-- ── 3. Drop the legacy user-scoped index ───────────────────────────────
--
-- The account-scoped equivalent workflow_runs_account_idx (on
-- (account_id, started_at DESC)) was added in the foundation slice and stays.

DROP INDEX IF EXISTS public.workflow_runs_user_idx;

-- ── 4. Drop workflow_runs.user_id ──────────────────────────────────────
--
-- After this column drop, application code that read or wrote
-- workflow_runs.user_id fails at compile/query time. Every consumer (engine
-- run-write, repos, run-history reads, billing projection, tests) is updated in
-- the same commit. ON DELETE behavior for auth.users deletion now flows through
-- accounts.owner_user_id (ON DELETE RESTRICT — explicit deletion flow required)
-- rather than the old workflow_runs.user_id CASCADE.

ALTER TABLE public.workflow_runs DROP COLUMN user_id;

-- ── 5. trigger_resources RLS → account-membership join-through ──────────
--
-- trigger_resources has NO V2-account column of its own; it inherits scope by
-- joining to its owning workflow's account_id. The session-client writers (the
-- activate/deactivate lifecycle, which runs under the workflow owner's session)
-- satisfy the membership predicate; cron/dispatcher reads stay service-role
-- (bypass RLS). The user_id column is KEPT as denormalized provenance.

DROP POLICY IF EXISTS trigger_resources_select_own ON public.trigger_resources;
DROP POLICY IF EXISTS trigger_resources_insert_own ON public.trigger_resources;
DROP POLICY IF EXISTS trigger_resources_update_own ON public.trigger_resources;
DROP POLICY IF EXISTS trigger_resources_delete_own ON public.trigger_resources;

CREATE POLICY trigger_resources_select_account_member ON public.trigger_resources
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = trigger_resources.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY trigger_resources_insert_account_member ON public.trigger_resources
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = trigger_resources.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY trigger_resources_update_account_member ON public.trigger_resources
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = trigger_resources.workflow_id
         AND am.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = trigger_resources.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY trigger_resources_delete_account_member ON public.trigger_resources
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = trigger_resources.workflow_id
         AND am.user_id = auth.uid()
    )
  );

-- ── 6. workflow_files RLS → account-membership join-through ─────────────
--
-- workflow_files had only a SELECT _own policy (writes are service-role from the
-- engine + cleanup cron). Rewrite the SELECT to join through workflows.account_id.
-- KEEP workflow_files.user_id (provenance + the <userId>/<workflowId>/... storage
-- path component).

DROP POLICY IF EXISTS workflow_files_select_own ON public.workflow_files;

CREATE POLICY workflow_files_select_account_member ON public.workflow_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = workflow_files.workflow_id
         AND am.user_id = auth.uid()
    )
  );

-- ── 7. Refresh the workflow_run_stats view comment ─────────────────────
--
-- The view body is unchanged (security_invoker, GROUP BY workflow_id). It now
-- transparently sees only the rows the account-membership RLS on workflow_runs
-- allows — the comment is updated for accuracy.

COMMENT ON VIEW public.workflow_run_stats IS
  'Lifetime per-workflow run aggregates (real runs only, is_test=false). '
  'security_invoker so workflow_runs RLS gates access — account-membership '
  'after Slice 4.ACCOUNT-MODEL-8 (was per-user).';
