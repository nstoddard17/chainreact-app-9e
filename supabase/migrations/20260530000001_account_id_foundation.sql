-- ChainReactV2 — account_id additive foundation (Slice 4.ACCOUNT-MODEL-5).
--
-- Phase B foundation per the cutover plan at
-- docs/slices/phase-4/account-id-cutover-plan.md. Adds account_id +
-- provenance columns to the three hot ownership tables (workflows,
-- integrations, workflow_runs) and ships DB-level BEFORE INSERT compat
-- triggers so existing application INSERT paths — which only supply
-- user_id — continue to succeed against the new NOT NULL columns.
--
-- NO application code changes in this slice. The repositories, OAuth
-- dispatcher, execution engine, and routes continue to insert via
-- user_id only; the compat triggers fill in account_id + provenance.
-- Per-table cutover slices (-6, -7, -8) update each table's writers and
-- DROP that table's compat trigger as their final step.
--
-- Hard scope fences honored here:
--   - No existing user_id RLS policy is dropped or modified.
--   - No existing user_id column is dropped.
--   - trigger_resources is NOT touched (its existing account_id text
--     column for provider account scope is unrelated to the V2 account
--     uuid columns added here — see cutover plan §"Tables in scope").
--   - workflow_revisions / workflow_files / trigger_resources do NOT
--     get account_id; their RLS joins-through-workflows lands in the
--     per-table cutover slices, not here.
--
-- Migration sequence in this file:
--   1. Add columns nullable on all three tables.
--   2. Backfill account_id (+ provenance) from each row's existing
--      user_id → personal account, per the slice -3 invariant.
--   3. Create BEFORE INSERT compat triggers.
--   4. Safety-check DO-block (aborts the migration if any row still has
--      NULL account_id after backfill).
--   5. SET NOT NULL on account_id.
--   6. Add account-membership RLS policies side-by-side with existing
--      user_id policies (Postgres OR-combines same-op policies).
--   7. Add supporting indexes.

-- ── 1. Add columns nullable ─────────────────────────────────────────────

ALTER TABLE public.workflows
  ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.integrations
  ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN connected_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.workflow_runs
  ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN triggered_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2. Backfill existing rows ──────────────────────────────────────────
--
-- Every row's existing user_id → that user's personal account (slice -3
-- invariant: every user has exactly one personal account). Provenance
-- columns get the existing user_id (created_by / connected_by); for
-- workflow_runs, triggered_by_user_id stays NULL on legacy rows because
-- legacy user_id always equalled workflow.user_id regardless of trigger
-- source — backfilling it would assert a false "human triggered this"
-- contract for webhook/polling/cron runs.

UPDATE public.workflows w
   SET account_id = a.id,
       created_by_user_id = w.user_id
  FROM public.accounts a
 WHERE a.type = 'personal'
   AND a.owner_user_id = w.user_id
   AND w.account_id IS NULL;

UPDATE public.integrations i
   SET account_id = a.id,
       connected_by_user_id = i.user_id
  FROM public.accounts a
 WHERE a.type = 'personal'
   AND a.owner_user_id = i.user_id
   AND i.account_id IS NULL;

UPDATE public.workflow_runs r
   SET account_id = a.id
  FROM public.accounts a
 WHERE a.type = 'personal'
   AND a.owner_user_id = r.user_id
   AND r.account_id IS NULL;

-- ── 3. Compat triggers ─────────────────────────────────────────────────
--
-- Each trigger is guarded by `IF NEW.<col> IS NULL` so it no-ops once
-- per-table cutover slices start inserting the columns directly. Each
-- cutover slice drops its trigger after updating the repository.
--
-- For workflows / integrations: derive account_id from NEW.user_id via
-- the user's personal account; set the provenance column from NEW.user_id.
--
-- For workflow_runs: derive account_id from the owning workflow's
-- account_id (already populated by the workflows compat trigger or the
-- backfill above). Do NOT auto-populate triggered_by_user_id — it stays
-- as supplied by the caller (NULL for legacy callers that don't pass it).
-- The engine populates it correctly per source after slice -8 cutover.

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
  -- triggered_by_user_id stays as supplied by the caller (NULL when not
  -- set). The engine populates it correctly per source after slice -8;
  -- legacy inserts leave it NULL, which is the honest backfill semantic.
  RETURN NEW;
END;
$$;

CREATE TRIGGER workflow_runs_compat_set_account
  BEFORE INSERT ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.workflow_runs_compat_set_account();

-- ── 4. Safety check ────────────────────────────────────────────────────
--
-- If any backfill row was missed, the migration aborts here BEFORE the
-- NOT NULL constraint is added — gives a clear error pointing at the
-- problem rather than a generic NOT NULL violation. Per the slice -3
-- invariant every user has a personal account, so this should always
-- pass; failure means the invariant was somehow violated and needs
-- investigation before re-applying.

DO $$
BEGIN
  IF (SELECT count(*) FROM public.workflows WHERE account_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'foundation backfill incomplete on workflows — account_id IS NULL for some rows';
  END IF;
  IF (SELECT count(*) FROM public.integrations WHERE account_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'foundation backfill incomplete on integrations — account_id IS NULL for some rows';
  END IF;
  IF (SELECT count(*) FROM public.workflow_runs WHERE account_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'foundation backfill incomplete on workflow_runs — account_id IS NULL for some rows';
  END IF;
END;
$$;

-- ── 5. SET NOT NULL ────────────────────────────────────────────────────

ALTER TABLE public.workflows     ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE public.integrations  ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE public.workflow_runs ALTER COLUMN account_id SET NOT NULL;

-- ── 6. Account-membership RLS policies (side by side with existing) ────
--
-- Postgres OR-combines policies of the same operation, so caller-side
-- queries succeed if EITHER the legacy `auth.uid() = user_id` predicate
-- OR the new account-membership predicate evaluates true. Both predicates
-- coexist until each table's cutover slice drops the `_own` policies.
--
-- Existing user_id-scoped policies (workflows_select_own,
-- workflows_insert_own, workflows_update_own, workflows_delete_own;
-- integrations_*_own; workflow_runs_select_own) are unchanged.

CREATE POLICY workflows_select_account_member ON public.workflows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflows.account_id
    )
  );

CREATE POLICY workflows_insert_account_member ON public.workflows
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflows.account_id
    )
  );

CREATE POLICY workflows_update_account_member ON public.workflows
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflows.account_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflows.account_id
    )
  );

CREATE POLICY workflows_delete_account_member ON public.workflows
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflows.account_id
    )
  );

CREATE POLICY integrations_select_account_member ON public.integrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = integrations.account_id
    )
  );

CREATE POLICY integrations_insert_account_member ON public.integrations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = integrations.account_id
    )
  );

CREATE POLICY integrations_update_account_member ON public.integrations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = integrations.account_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = integrations.account_id
    )
  );

CREATE POLICY integrations_delete_account_member ON public.integrations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = integrations.account_id
    )
  );

-- workflow_runs has only a SELECT policy today (writes are service-role).
CREATE POLICY workflow_runs_select_account_member ON public.workflow_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflow_runs.account_id
    )
  );

-- ── 7. Indexes ─────────────────────────────────────────────────────────
--
-- - account_id composite indexes mirror the existing user_id composite
--   indexes so per-table cutover slices have the planner support they
--   need before flipping readers.
-- - integrations_account_active_unique is additive alongside the existing
--   integrations_active_unique (user_id-scoped); each cutover slice drops
--   the user_id-scoped one at its own pace.
-- - account_memberships_user_id_idx is a defensive support index for the
--   membership-join RLS predicate which filters by user_id first
--   (composite PK on (account_id, user_id) doesn't help that direction).

CREATE INDEX workflows_account_id_active_idx
  ON public.workflows (account_id, updated_at DESC)
  WHERE state <> 'deleted';

CREATE UNIQUE INDEX integrations_account_active_unique
  ON public.integrations (account_id, provider, provider_account_id)
  WHERE disconnected_at IS NULL;

CREATE INDEX workflow_runs_account_idx
  ON public.workflow_runs (account_id, started_at DESC);

CREATE INDEX account_memberships_user_id_idx
  ON public.account_memberships (user_id);
