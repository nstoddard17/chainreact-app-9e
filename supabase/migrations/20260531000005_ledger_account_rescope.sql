-- ChainReactV2 — billing/usage ledger account rescope (Slice 4.ACCOUNT-MODEL-9d).
--
-- Phase C final step. Re-keys the three billing/usage ledgers from user
-- ownership to ACCOUNT ownership, keeping a user column ONLY where it carries a
-- real actor/provenance meaning (not the owner). Idempotency uniqueness +
-- analytics scope move to account_id; RLS flips to account-membership.
--
-- Per-table owner/actor decision:
--   - task_usage_events     OWNER = account. user_id was the engine's
--       workflow.createdByUserId used purely as the billing-owner/query key
--       (the author is recoverable via workflow_id -> workflows.created_by_user_id),
--       so it is DROPPED — not retained as provenance.
--   - billing_shadow_comparisons  OWNER = account. user_id was the run owner;
--       a shadow comparison has no actor meaning → DROPPED.
--   - ai_cost_events        OWNER = account; KEEP user_id as the ACTOR (the user
--       who drove the AI interaction — genuinely distinct from the owning
--       account, e.g. a builder AI call before a workflow exists). Empty table
--       today (AI paused) — the account_id add is forward-looking.
--
-- ON DELETE CASCADE on every account_id: these are disposable historical
-- ledgers (account_billing remains the authoritative billing state), matching
-- the prior user_id CASCADE — when the owning account is removed (deletion
-- flow), its ledger rows go with it.
--
-- OUT OF SCOPE: account_billing canonical behavior (9c2) is untouched; no
-- user_billing / user-keyed RPC is recreated.
--
-- ROLLBACK (pre-launch): re-add user_id (backfill via accounts.owner_user_id),
-- restore the user-keyed indexes + _select_own policies, drop the account_id
-- columns + membership policies + account indexes.

-- ── 1. task_usage_events: owner → account_id (drop user_id) ──────────────────

ALTER TABLE public.task_usage_events
  ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE;

UPDATE public.task_usage_events e
   SET account_id = a.id
  FROM public.accounts a
 WHERE a.type = 'personal'
   AND a.owner_user_id = e.user_id
   AND e.account_id IS NULL;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.task_usage_events WHERE account_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'task_usage_events account_id backfill incomplete';
  END IF;
END;
$$;

ALTER TABLE public.task_usage_events ALTER COLUMN account_id SET NOT NULL;

-- Drop user-keyed RLS + indexes (incl. the two idempotency indexes), then the column.
DROP POLICY IF EXISTS task_usage_events_select_own ON public.task_usage_events;
DROP INDEX IF EXISTS public.task_usage_events_user_idx;
DROP INDEX IF EXISTS public.task_usage_events_run_level_idem;
DROP INDEX IF EXISTS public.task_usage_events_node_level_idem;
ALTER TABLE public.task_usage_events DROP COLUMN user_id;

-- Re-key idempotency on account_id (a run belongs to one account, so this is the
-- same uniqueness, account-scoped). Run-level: one (account, run, event_type)
-- where node_id IS NULL; node-level: one (account, run, node, event_type).
CREATE UNIQUE INDEX task_usage_events_run_level_idem
  ON public.task_usage_events (account_id, workflow_run_id, event_type)
  WHERE workflow_run_id IS NOT NULL AND node_id IS NULL;
CREATE UNIQUE INDEX task_usage_events_node_level_idem
  ON public.task_usage_events (account_id, workflow_run_id, node_id, event_type)
  WHERE workflow_run_id IS NOT NULL AND node_id IS NOT NULL;

-- "Usage for this account over time" (replaces the user axis).
CREATE INDEX task_usage_events_account_idx
  ON public.task_usage_events (account_id, created_at DESC);

CREATE POLICY task_usage_events_select_account_member ON public.task_usage_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = task_usage_events.account_id
    )
  );

-- ── 2. billing_shadow_comparisons: owner → account_id (drop user_id) ─────────

ALTER TABLE public.billing_shadow_comparisons
  ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE;

UPDATE public.billing_shadow_comparisons s
   SET account_id = a.id
  FROM public.accounts a
 WHERE a.type = 'personal'
   AND a.owner_user_id = s.user_id
   AND s.account_id IS NULL;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.billing_shadow_comparisons WHERE account_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'billing_shadow_comparisons account_id backfill incomplete';
  END IF;
END;
$$;

ALTER TABLE public.billing_shadow_comparisons ALTER COLUMN account_id SET NOT NULL;

DROP POLICY IF EXISTS billing_shadow_comparisons_select_own ON public.billing_shadow_comparisons;
DROP INDEX IF EXISTS public.billing_shadow_comparisons_user_idx;
ALTER TABLE public.billing_shadow_comparisons DROP COLUMN user_id;

-- The per-run UNIQUE index (workflow_run_id) is unchanged (run-scoped idempotency).
CREATE INDEX billing_shadow_comparisons_account_idx
  ON public.billing_shadow_comparisons (account_id, created_at DESC);

CREATE POLICY billing_shadow_comparisons_select_account_member ON public.billing_shadow_comparisons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = billing_shadow_comparisons.account_id
    )
  );

-- ── 3. ai_cost_events: add account_id (owner); KEEP user_id (actor) ──────────
--
-- Empty today (AI paused). user_id stays as the ACTOR who drove the AI
-- interaction; account_id is the cost owner. RLS reads by account membership.

ALTER TABLE public.ai_cost_events
  ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE;

UPDATE public.ai_cost_events e
   SET account_id = a.id
  FROM public.accounts a
 WHERE a.type = 'personal'
   AND a.owner_user_id = e.user_id
   AND e.account_id IS NULL;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.ai_cost_events WHERE account_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'ai_cost_events account_id backfill incomplete';
  END IF;
END;
$$;

ALTER TABLE public.ai_cost_events ALTER COLUMN account_id SET NOT NULL;

-- Reads flip to account membership; the analytics axis moves to account.
DROP POLICY IF EXISTS ai_cost_events_select_own ON public.ai_cost_events;
DROP INDEX IF EXISTS public.ai_cost_events_user_idx;

CREATE INDEX ai_cost_events_account_idx
  ON public.ai_cost_events (account_id, created_at DESC);

CREATE POLICY ai_cost_events_select_account_member ON public.ai_cost_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = ai_cost_events.account_id
    )
  );
