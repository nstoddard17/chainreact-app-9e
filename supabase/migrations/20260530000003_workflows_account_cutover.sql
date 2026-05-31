-- ChainReactV2 — workflows account_id cutover (Slice 4.ACCOUNT-MODEL-7).
--
-- Phase B per the cutover plan at
-- docs/slices/phase-4/account-id-cutover-plan.md §"Slice 4.ACCOUNT-MODEL-7".
-- Flips workflows (and the adjacent workflow_revisions) from user_id
-- ownership to account_id ownership at the schema + RLS layer.
-- Application-code cutover (repositories/workflows.ts, the workflow API
-- routes, the builder list page, and the AI ownership-check chain) lands
-- in the same commit.
--
-- Order in this migration:
--   1. Drop the legacy user_id RLS policies on `workflows`.
--   2. Drop the legacy user_id RLS policies on `workflow_revisions`.
--   3. Add account-membership RLS policies on `workflow_revisions`
--      (it inherits scope by JOINing through workflows.account_id — it
--      gets NO account_id column of its own).
--   4. Drop the foundation slice's `workflows_compat_set_account` trigger
--      + function (the repository now supplies account_id +
--      created_by_user_id directly).
--   5. Drop the legacy user-scoped index `workflows_user_id_active_idx`.
--   6. Drop `workflow_revisions.user_id` (it was denormalized for the old
--      RLS only; the new RLS joins through the workflow).
--   7. Drop `workflows.user_id`.
--
-- Post-migration state:
--   - `workflows.account_id` is the authoritative owner (NOT NULL, FK to
--     accounts(id) ON DELETE RESTRICT — set by the foundation slice).
--   - `workflows.created_by_user_id` carries provenance (the human who
--     first created the workflow; ON DELETE SET NULL). NOT authorization.
--   - workflows RLS reads + writes scoped by account membership only
--     (workflows_select_account_member / _insert_ / _update_ / _delete_,
--     created in the foundation slice).
--   - workflow_revisions RLS scoped by account membership via a JOIN
--     through workflows.account_id.
--   - `workflows.user_id` and `workflow_revisions.user_id` columns do NOT
--     exist.
--
-- Hard scope fences:
--   - No change to `integrations` (already cut over in slice -6),
--     `workflow_runs`, `trigger_resources`, `workflow_files`,
--     `user_billing`. workflow_runs + the adjacent-table RLS flip is
--     slice -8; billing is Phase C.
--   - `trigger_resources.account_id` (text, provider account) NOT touched.
--   - `trigger_resources.user_id` / `hubspot_subscription_refs.user_id`
--     (denormalized provenance copies on OTHER tables) NOT touched — they
--     are independent columns, not references to workflows.user_id.
--   - The `workflow_run_stats` view (slice -8 territory) reads only
--     `workflow_runs`; it has no workflows.user_id dependency.
--
-- Rollback recipe (pre-launch, no production data):
--   git revert the code commit, then apply a forward migration that:
--     ALTER TABLE public.workflows       ADD COLUMN user_id uuid;
--     ALTER TABLE public.workflow_revisions ADD COLUMN user_id uuid;
--     UPDATE public.workflows w  SET user_id = a.owner_user_id
--       FROM public.accounts a WHERE a.id = w.account_id AND a.type='personal';
--     UPDATE public.workflow_revisions r SET user_id = w.user_id
--       FROM public.workflows w WHERE w.id = r.workflow_id;
--     -- (safe because personal accounts have exactly one owner — slice -3 invariant)
--     ALTER TABLE public.workflows       ALTER COLUMN user_id SET NOT NULL;
--     ALTER TABLE public.workflow_revisions ALTER COLUMN user_id SET NOT NULL;
--     CREATE INDEX workflows_user_id_active_idx
--       ON public.workflows (user_id, updated_at DESC) WHERE state <> 'deleted';
--     -- re-create workflows_*_own + workflow_revisions_*_own policies
--     --   from 20260506000000_workflows.sql, drop the _account_member /
--     --   join policies added here, and re-create the compat trigger from
--     --   20260530000001_account_id_foundation.sql.

-- ── 1. Drop legacy user_id RLS policies on workflows ────────────────────

DROP POLICY IF EXISTS workflows_select_own ON public.workflows;
DROP POLICY IF EXISTS workflows_insert_own ON public.workflows;
DROP POLICY IF EXISTS workflows_update_own ON public.workflows;
DROP POLICY IF EXISTS workflows_delete_own ON public.workflows;

-- The account-membership policies from the foundation slice
-- (workflows_select_account_member, _insert_, _update_, _delete_) remain
-- and now serve as the only RLS predicates on the table.

-- ── 2. Drop legacy user_id RLS policies on workflow_revisions ───────────

DROP POLICY IF EXISTS workflow_revisions_select_own ON public.workflow_revisions;
DROP POLICY IF EXISTS workflow_revisions_insert_own ON public.workflow_revisions;

-- ── 3. Account-membership RLS on workflow_revisions (JOIN through wf) ───
--
-- workflow_revisions gets NO account_id column of its own (cutover plan
-- §"Tables in scope"). It inherits scope by joining to its owning
-- workflow's account_id and checking the caller's membership. SELECT +
-- INSERT only — immutability + cascade-delete semantics are still
-- enforced by the absence of UPDATE / DELETE policies (matches the
-- original 20260506000000_workflows.sql design).

CREATE POLICY workflow_revisions_select_account_member ON public.workflow_revisions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = workflow_revisions.workflow_id
         AND am.user_id = auth.uid()
    )
  );

CREATE POLICY workflow_revisions_insert_account_member ON public.workflow_revisions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
       WHERE w.id = workflow_revisions.workflow_id
         AND am.user_id = auth.uid()
    )
  );

-- ── 4. Drop the foundation compat trigger ──────────────────────────────
--
-- repositories/workflows.ts:create now supplies account_id +
-- created_by_user_id directly. The trigger has become a no-op; dropping
-- it removes the per-INSERT lookup overhead and prevents future writers
-- from accidentally relying on auto-population.

DROP TRIGGER IF EXISTS workflows_compat_set_account ON public.workflows;
DROP FUNCTION IF EXISTS public.workflows_compat_set_account();

-- ── 5. Drop the legacy user-scoped index ───────────────────────────────
--
-- The account-scoped equivalent `workflows_account_id_active_idx` (on
-- (account_id, updated_at DESC) WHERE state <> 'deleted') was added in the
-- foundation slice and stays in place. The user-scoped version is no
-- longer the source of list-ordering support. (Postgres would auto-drop
-- it with the column below; dropping it explicitly keeps intent clear.)

DROP INDEX IF EXISTS public.workflows_user_id_active_idx;

-- ── 6. Drop workflow_revisions.user_id ─────────────────────────────────
--
-- Denormalized for the old per-row RLS only. The new RLS joins through
-- workflows.account_id, so the column is dead. createRevision no longer
-- writes it; revisionRowToRecord no longer reads it.

ALTER TABLE public.workflow_revisions DROP COLUMN user_id;

-- ── 7. Drop workflows.user_id ──────────────────────────────────────────
--
-- After this column drop, application code that read or wrote
-- workflows.user_id fails at compile/query time. Every consumer
-- (repository, routes, AI ownership checks, list page, tests) is updated
-- in the same commit. ON DELETE behavior for auth.users deletion now
-- flows through accounts.owner_user_id (ON DELETE RESTRICT — explicit
-- deletion flow required) rather than the old workflows.user_id CASCADE.

ALTER TABLE public.workflows DROP COLUMN user_id;
