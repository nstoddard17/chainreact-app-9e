-- ChainReactV2 — account deletion lifecycle + pending_deletion freeze.
--
-- Phase D step 4.ACCOUNT-MODEL-10b. Implements the lifecycle columns and the
-- RLS-level account freeze from the deletion-flow plan
-- (docs/slices/phase-4/account-deletion-flow-plan.md). This slice does NOT
-- purge, revoke tokens, delete auth.users, or anonymize ledgers — those are
-- 10c/10d. It only:
--   1. Adds deletion lifecycle columns to accounts.
--   2. Creates the durable account_deletions audit table.
--   3. Re-points every account-membership RLS policy so a pending_deletion
--      account's operational data is invisible through the session (anon)
--      client. accounts_select_member is deliberately NOT touched — the owner
--      must still be able to read their own account row to see the
--      "deletion pending — cancel?" state and to drive cancel/restore.
--
-- Freeze model: a `pending_deletion` account is non-operational. RLS hides its
-- workflows / integrations / runs / ledgers from the session client; the
-- application-layer guards (services/accounts/accountFreeze.ts) cover the
-- service-role background paths (engine, cron, OAuth refresh) that bypass RLS.
--
-- The purge cron + deletion service use the service-role client, which bypasses
-- RLS, so they still see + tear down frozen accounts in 10c.
--
-- Idempotent: guards every step; re-running is a no-op.

-- ── Lifecycle columns on accounts ────────────────────────────────────────────

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS deletion_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_requested_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_deletion_status_check'
  ) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_deletion_status_check
      CHECK (deletion_status IN ('active', 'pending_deletion'));
  END IF;
END $$;

-- Partial index: the purge cron (10c) scans for due frozen accounts.
CREATE INDEX IF NOT EXISTS accounts_pending_deletion_purge_after_idx
  ON public.accounts (purge_after)
  WHERE deletion_status = 'pending_deletion';

-- ── Durable deletion audit table ─────────────────────────────────────────────
--
-- Outlives the account AND the user (no FKs to accounts / auth.users) so the
-- bookkeeping survives purge. Stores NO user content — ids + timestamps + status
-- only. The subject user can read their own rows (for the pending-deletion UI);
-- all writes are service-role.

CREATE TABLE IF NOT EXISTS public.account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT account_deletions_status_check
    CHECK (status IN ('pending', 'cancelled', 'purged')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by_user_id uuid,
  purge_after timestamptz NOT NULL,
  cancelled_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_deletions_account_id_idx
  ON public.account_deletions (account_id);
CREATE INDEX IF NOT EXISTS account_deletions_owner_user_id_idx
  ON public.account_deletions (owner_user_id);

ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

-- Data API access. Required after Supabase removes implicit grants
-- (new projects May 30, 2026; existing projects October 30, 2026).
GRANT SELECT ON public.account_deletions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_deletions TO service_role;

-- The subject user can read their own deletion records (keyed on owner_user_id,
-- independent of the account freeze so the cancel UI always resolves). Writes
-- are service-role only — no user-facing INSERT/UPDATE/DELETE policy.
CREATE POLICY account_deletions_select_subject ON public.account_deletions
  FOR SELECT
  USING (auth.uid() = owner_user_id);

-- ── Account freeze: re-point membership RLS to exclude pending_deletion ───────
--
-- Every operational policy gains a join to accounts with
-- `a.deletion_status = 'active'`. accounts_select_member +
-- account_memberships_select_self are intentionally left alone.

-- workflows (direct account_id)
DROP POLICY IF EXISTS workflows_select_account_member ON public.workflows;
CREATE POLICY workflows_select_account_member ON public.workflows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflows.account_id
        AND a.deletion_status = 'active'
    )
  );

DROP POLICY IF EXISTS workflows_insert_account_member ON public.workflows;
CREATE POLICY workflows_insert_account_member ON public.workflows
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflows.account_id
        AND a.deletion_status = 'active'
    )
  );

DROP POLICY IF EXISTS workflows_update_account_member ON public.workflows;
CREATE POLICY workflows_update_account_member ON public.workflows
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflows.account_id
        AND a.deletion_status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflows.account_id
        AND a.deletion_status = 'active'
    )
  );

DROP POLICY IF EXISTS workflows_delete_account_member ON public.workflows;
CREATE POLICY workflows_delete_account_member ON public.workflows
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflows.account_id
        AND a.deletion_status = 'active'
    )
  );

-- workflow_revisions (join-through workflows)
DROP POLICY IF EXISTS workflow_revisions_select_account_member ON public.workflow_revisions;
CREATE POLICY workflow_revisions_select_account_member ON public.workflow_revisions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
        JOIN public.accounts a ON a.id = w.account_id
       WHERE w.id = workflow_revisions.workflow_id
         AND am.user_id = auth.uid()
         AND a.deletion_status = 'active'
    )
  );

DROP POLICY IF EXISTS workflow_revisions_insert_account_member ON public.workflow_revisions;
CREATE POLICY workflow_revisions_insert_account_member ON public.workflow_revisions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
        JOIN public.accounts a ON a.id = w.account_id
       WHERE w.id = workflow_revisions.workflow_id
         AND am.user_id = auth.uid()
         AND a.deletion_status = 'active'
    )
  );

-- workflow_runs (direct account_id, select-only)
DROP POLICY IF EXISTS workflow_runs_select_account_member ON public.workflow_runs;
CREATE POLICY workflow_runs_select_account_member ON public.workflow_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = workflow_runs.account_id
        AND a.deletion_status = 'active'
    )
  );

-- trigger_resources (join-through workflows, select-only)
DROP POLICY IF EXISTS trigger_resources_select_account_member ON public.trigger_resources;
CREATE POLICY trigger_resources_select_account_member ON public.trigger_resources
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
        JOIN public.accounts a ON a.id = w.account_id
       WHERE w.id = trigger_resources.workflow_id
         AND am.user_id = auth.uid()
         AND a.deletion_status = 'active'
    )
  );

-- workflow_files (join-through workflows, select-only)
DROP POLICY IF EXISTS workflow_files_select_account_member ON public.workflow_files;
CREATE POLICY workflow_files_select_account_member ON public.workflow_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.workflows w
        JOIN public.account_memberships am ON am.account_id = w.account_id
        JOIN public.accounts a ON a.id = w.account_id
       WHERE w.id = workflow_files.workflow_id
         AND am.user_id = auth.uid()
         AND a.deletion_status = 'active'
    )
  );

-- integrations (direct account_id) — full CRUD policies were created in the
-- 6b cutover; re-point all four.
DROP POLICY IF EXISTS integrations_select_account_member ON public.integrations;
CREATE POLICY integrations_select_account_member ON public.integrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = integrations.account_id
        AND a.deletion_status = 'active'
    )
  );

DROP POLICY IF EXISTS integrations_insert_account_member ON public.integrations;
CREATE POLICY integrations_insert_account_member ON public.integrations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = integrations.account_id
        AND a.deletion_status = 'active'
    )
  );

DROP POLICY IF EXISTS integrations_update_account_member ON public.integrations;
CREATE POLICY integrations_update_account_member ON public.integrations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = integrations.account_id
        AND a.deletion_status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = integrations.account_id
        AND a.deletion_status = 'active'
    )
  );

DROP POLICY IF EXISTS integrations_delete_account_member ON public.integrations;
CREATE POLICY integrations_delete_account_member ON public.integrations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = integrations.account_id
        AND a.deletion_status = 'active'
    )
  );

-- task_usage_events (direct account_id, select-only)
DROP POLICY IF EXISTS task_usage_events_select_account_member ON public.task_usage_events;
CREATE POLICY task_usage_events_select_account_member ON public.task_usage_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = task_usage_events.account_id
        AND a.deletion_status = 'active'
    )
  );

-- ai_cost_events (direct account_id, select-only)
DROP POLICY IF EXISTS ai_cost_events_select_account_member ON public.ai_cost_events;
CREATE POLICY ai_cost_events_select_account_member ON public.ai_cost_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = ai_cost_events.account_id
        AND a.deletion_status = 'active'
    )
  );

-- billing_shadow_comparisons (direct account_id, select-only)
DROP POLICY IF EXISTS billing_shadow_comparisons_select_account_member ON public.billing_shadow_comparisons;
CREATE POLICY billing_shadow_comparisons_select_account_member ON public.billing_shadow_comparisons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = billing_shadow_comparisons.account_id
        AND a.deletion_status = 'active'
    )
  );

-- account_billing (direct account_id, select-only)
DROP POLICY IF EXISTS account_billing_select_account_member ON public.account_billing;
CREATE POLICY account_billing_select_account_member ON public.account_billing
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.user_id = auth.uid()
        AND am.account_id = account_billing.account_id
        AND a.deletion_status = 'active'
    )
  );
