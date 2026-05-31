-- ChainReactV2 — account_billing foundation (Slice 4.ACCOUNT-MODEL-9b).
--
-- Phase C step 1 per docs/slices/phase-4/account-billing-rescope-plan.md
-- §"Slice -9b". Introduces account-scoped billing SIDE-BY-SIDE with the live
-- user-scoped system, changing NO live billing behavior:
--   - Creates public.account_billing (account_id PK), mirroring user_billing's
--     quota/counter shape.
--   - Backfills one row per personal account from the owner's user_billing row
--     (idempotent, via a callable backfill_account_billing() function).
--   - Adds account-keyed `_v2` billing RPCs that mirror the user-keyed ones
--     byte-for-byte (atomic row-lock check-and-write, exhaustion boundary,
--     concurrent-overspend protection) — keyed on account_billing instead of
--     user_billing.
--
-- HARD FENCES (this slice):
--   - user_billing is NOT dropped; the user-keyed RPCs (deduct/reserve/
--     reconcile/release/release_expired, last fixed in 9a / 20260531000000) are
--     NOT modified.
--   - handle_new_user() is NOT changed — new signups still get only user_billing.
--     The _v2 RPCs self-heal a missing account_billing row (INSERT ... ON
--     CONFLICT DO NOTHING), mirroring the user-keyed self-heal, so the absence
--     of dual-seeding does not break the account path. Dual-seed / repoint is
--     slice -9c.
--   - No production caller is repointed to the _v2 RPCs. Live billing stays
--     user-scoped.
--
-- ROLLBACK (pre-launch, no prod data): DROP the five _v2 functions + the
-- backfill function, then DROP TABLE public.account_billing. No live caller
-- depends on any of it, so this is a clean reverse migration.

-- ── 1. account_billing table (mirrors user_billing, keyed on account_id) ─────
--
-- account_id PK + ON DELETE RESTRICT FK to accounts: billing is the durable
-- per-account root (rule doc §"Billing and usage rules") and must not vanish
-- implicitly when an auth user / account is removed — removal goes through the
-- (future) account-deletion flow. Counter columns + the tasks_reserved
-- non-negativity CHECK match user_billing exactly.

CREATE TABLE public.account_billing (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE RESTRICT,
  tasks_limit int NOT NULL DEFAULT 100,
  tasks_used int NOT NULL DEFAULT 0,
  tasks_reserved int NOT NULL DEFAULT 0
    CONSTRAINT account_billing_tasks_reserved_nonneg CHECK (tasks_reserved >= 0),
  period_started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_billing ENABLE ROW LEVEL SECURITY;

-- Reads: any member of the account sees its billing row (the canonical
-- membership-join predicate, rule doc §"RLS and security direction"). Writes
-- happen exclusively via the SECURITY DEFINER RPCs / service-role — no
-- user-facing INSERT/UPDATE/DELETE policies (default-deny so a user cannot reset
-- their own counters), matching user_billing.
CREATE POLICY account_billing_select_account_member ON public.account_billing
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = account_billing.account_id
    )
  );

-- Explicit Data API grants (least privilege; required after Oct 30 2026 per
-- database-security.md). authenticated may only SELECT (RLS narrows to member
-- rows); service_role owns all writes.
GRANT SELECT ON public.account_billing TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_billing TO service_role;

CREATE TRIGGER account_billing_set_updated_at
  BEFORE UPDATE ON public.account_billing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. Idempotent backfill (callable, so tests can exercise it directly) ─────
--
-- One account_billing row per PERSONAL account, inheriting the owner's
-- user_billing counters verbatim (tasks_limit / tasks_used / tasks_reserved /
-- period_started_at). 1:1 mapping — team/org accounts don't exist yet (Phase D).
-- ON CONFLICT DO NOTHING makes it safe to re-run (idempotent). Returns the
-- number of rows inserted. service_role-only.

CREATE OR REPLACE FUNCTION public.backfill_account_billing()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int;
BEGIN
  INSERT INTO public.account_billing
    (account_id, tasks_limit, tasks_used, tasks_reserved, period_started_at)
  SELECT a.id, ub.tasks_limit, ub.tasks_used, ub.tasks_reserved, ub.period_started_at
    FROM public.accounts a
    JOIN public.user_billing ub ON ub.user_id = a.owner_user_id
   WHERE a.type = 'personal'
  ON CONFLICT (account_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_account_billing() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_account_billing() TO service_role;

-- Run the backfill once as part of the migration.
SELECT public.backfill_account_billing();

-- Safety check: every personal account must now have exactly one account_billing
-- row (each personal owner has a user_billing row — backfilled in
-- 20260507000002 + seeded by handle_new_user — so the join covers all of them).
-- Abort the migration (atomic rollback) if the counts diverge.
DO $$
DECLARE
  v_personal int;
  v_billing int;
BEGIN
  SELECT count(*) INTO v_personal FROM public.accounts WHERE type = 'personal';
  SELECT count(*) INTO v_billing FROM public.account_billing;
  IF v_billing <> v_personal THEN
    RAISE EXCEPTION 'account_billing backfill incomplete: % personal accounts but % account_billing rows', v_personal, v_billing;
  END IF;
END;
$$;

-- ── 3. Account-keyed `_v2` RPCs (mirror the user-keyed semantics exactly) ────
--
-- Transitional `_v2` names avoid the (uuid,int)/(uuid,uuid,int)/... signature
-- collision with the still-live user-keyed functions; slice -9c renames these to
-- the canonical names and drops the user-keyed originals. Each preserves the
-- atomic UPDATE ... WHERE <capacity predicate> RETURNING shape (row-lock makes
-- check-and-write race-free) and self-heals a missing account_billing row.
-- The reserve/reconcile/release run lookup keys directly on
-- workflow_runs.account_id (the run carries it after Phase B) = the billing key,
-- so no accounts join is needed (cleaner than the 9a user-keyed fix, same guard:
-- the run must belong to the billed account).

-- 3a. deduct_tasks_if_available_v2 — flat gate (ignores tasks_reserved, like the
--     user-keyed flat deduct).
CREATE OR REPLACE FUNCTION public.deduct_tasks_if_available_v2(
  p_account_id uuid,
  p_amount int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used int;
  v_limit int;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'deduct_tasks_if_available_v2: p_amount must be positive (got %)', p_amount;
  END IF;

  INSERT INTO public.account_billing (account_id)
    VALUES (p_account_id)
    ON CONFLICT (account_id) DO NOTHING;

  UPDATE public.account_billing
     SET tasks_used = tasks_used + p_amount
   WHERE account_id = p_account_id
     AND tasks_used + p_amount <= tasks_limit
   RETURNING tasks_used, tasks_limit
   INTO v_used, v_limit;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit);
  END IF;

  SELECT tasks_used, tasks_limit
    INTO v_used, v_limit
    FROM public.account_billing
   WHERE account_id = p_account_id;

  RETURN jsonb_build_object('ok', false, 'used', v_used, 'limit', v_limit);
END;
$$;

-- 3b. reserve_tasks_if_available_v2
CREATE OR REPLACE FUNCTION public.reserve_tasks_if_available_v2(
  p_account_id uuid,
  p_amount int,
  p_run_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_reserved_run int;
  v_used int;
  v_reserved int;
  v_limit int;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'reserve_tasks_if_available_v2: p_amount must be >= 0 (got %)', p_amount;
  END IF;

  INSERT INTO public.account_billing (account_id)
    VALUES (p_account_id)
    ON CONFLICT (account_id) DO NOTHING;

  SELECT wr.billing_status, wr.reserved_task_cost
    INTO v_status, v_reserved_run
    FROM public.workflow_runs wr
   WHERE wr.id = p_run_id AND wr.account_id = p_account_id;

  IF NOT FOUND THEN
    SELECT tasks_used, tasks_reserved, tasks_limit
      INTO v_used, v_reserved, v_limit
      FROM public.account_billing WHERE account_id = p_account_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_found',
      'used', v_used, 'reserved', v_reserved, 'limit', v_limit, 'amount', p_amount);
  END IF;

  IF v_status IN ('reserved', 'reconciled', 'released') THEN
    SELECT tasks_used, tasks_reserved, tasks_limit
      INTO v_used, v_reserved, v_limit
      FROM public.account_billing WHERE account_id = p_account_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'already_' || v_status,
      'used', v_used, 'reserved', v_reserved, 'limit', v_limit,
      'amount', COALESCE(v_reserved_run, 0));
  END IF;

  IF p_amount = 0 THEN
    UPDATE public.workflow_runs
       SET reserved_task_cost = 0,
           billing_status = 'reserved',
           reservation_id = COALESCE(reservation_id, p_run_id),
           reservation_expires_at = p_expires_at
     WHERE id = p_run_id;
    SELECT tasks_used, tasks_reserved, tasks_limit
      INTO v_used, v_reserved, v_limit
      FROM public.account_billing WHERE account_id = p_account_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'reserved',
      'used', v_used, 'reserved', v_reserved, 'limit', v_limit, 'amount', 0);
  END IF;

  UPDATE public.account_billing
     SET tasks_reserved = tasks_reserved + p_amount
   WHERE account_id = p_account_id
     AND tasks_used + tasks_reserved + p_amount <= tasks_limit
   RETURNING tasks_used, tasks_reserved, tasks_limit
   INTO v_used, v_reserved, v_limit;

  IF FOUND THEN
    UPDATE public.workflow_runs
       SET reserved_task_cost = p_amount,
           billing_status = 'reserved',
           reservation_id = COALESCE(reservation_id, p_run_id),
           reservation_expires_at = p_expires_at
     WHERE id = p_run_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'reserved',
      'used', v_used, 'reserved', v_reserved, 'limit', v_limit, 'amount', p_amount);
  END IF;

  UPDATE public.workflow_runs
     SET billing_status = 'failed'
   WHERE id = p_run_id;
  SELECT tasks_used, tasks_reserved, tasks_limit
    INTO v_used, v_reserved, v_limit
    FROM public.account_billing WHERE account_id = p_account_id;
  RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_tasks',
    'used', v_used, 'reserved', v_reserved, 'limit', v_limit, 'amount', p_amount);
END;
$$;

-- 3c. reconcile_task_reservation_v2
CREATE OR REPLACE FUNCTION public.reconcile_task_reservation_v2(
  p_account_id uuid,
  p_run_id uuid,
  p_actual int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_reserved_run int;
  v_reconciled_run int;
  v_charge int;
  v_refund int;
  v_over boolean;
  v_used int;
  v_reserved int;
  v_limit int;
BEGIN
  IF p_actual < 0 THEN
    RAISE EXCEPTION 'reconcile_task_reservation_v2: p_actual must be >= 0 (got %)', p_actual;
  END IF;

  SELECT wr.billing_status, wr.reserved_task_cost, wr.reconciled_task_cost
    INTO v_status, v_reserved_run, v_reconciled_run
    FROM public.workflow_runs wr
   WHERE wr.id = p_run_id AND wr.account_id = p_account_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_found');
  END IF;

  IF v_status = 'reconciled' THEN
    SELECT tasks_used, tasks_reserved, tasks_limit
      INTO v_used, v_reserved, v_limit
      FROM public.account_billing WHERE account_id = p_account_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'already_reconciled',
      'used', v_used, 'reserved', v_reserved, 'limit', v_limit,
      'charged', COALESCE(v_reconciled_run, 0), 'refunded', 0);
  END IF;

  IF v_status IS DISTINCT FROM 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'reason',
      COALESCE('not_reserved_' || v_status, 'not_reserved'));
  END IF;

  v_reserved_run := COALESCE(v_reserved_run, 0);
  v_charge := LEAST(p_actual, v_reserved_run);
  v_refund := v_reserved_run - v_charge;
  v_over := p_actual > v_reserved_run;

  UPDATE public.account_billing
     SET tasks_used = tasks_used + v_charge,
         tasks_reserved = GREATEST(0, tasks_reserved - v_reserved_run)
   WHERE account_id = p_account_id
   RETURNING tasks_used, tasks_reserved, tasks_limit
   INTO v_used, v_reserved, v_limit;

  UPDATE public.workflow_runs
     SET reconciled_task_cost = v_charge,
         billing_status = 'reconciled',
         billing_reconciled_at = now()
   WHERE id = p_run_id;

  RETURN jsonb_build_object('ok', true,
    'reason', CASE WHEN v_over THEN 'reconcile_over_reserve' ELSE 'reconciled' END,
    'used', v_used, 'reserved', v_reserved, 'limit', v_limit,
    'charged', v_charge, 'refunded', v_refund);
END;
$$;

-- 3d. release_task_reservation_v2
CREATE OR REPLACE FUNCTION public.release_task_reservation_v2(
  p_account_id uuid,
  p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_reserved_run int;
  v_reserved int;
  v_limit int;
BEGIN
  SELECT wr.billing_status, wr.reserved_task_cost
    INTO v_status, v_reserved_run
    FROM public.workflow_runs wr
   WHERE wr.id = p_run_id AND wr.account_id = p_account_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_found');
  END IF;

  IF v_status IN ('released', 'reconciled') THEN
    SELECT tasks_reserved, tasks_limit INTO v_reserved, v_limit
      FROM public.account_billing WHERE account_id = p_account_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'already_' || v_status,
      'reserved', v_reserved, 'limit', v_limit, 'released', 0);
  END IF;

  IF v_status IS DISTINCT FROM 'reserved' THEN
    SELECT tasks_reserved, tasks_limit INTO v_reserved, v_limit
      FROM public.account_billing WHERE account_id = p_account_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'nothing_to_release',
      'reserved', v_reserved, 'limit', v_limit, 'released', 0);
  END IF;

  v_reserved_run := COALESCE(v_reserved_run, 0);

  UPDATE public.account_billing
     SET tasks_reserved = GREATEST(0, tasks_reserved - v_reserved_run)
   WHERE account_id = p_account_id
   RETURNING tasks_reserved, tasks_limit
   INTO v_reserved, v_limit;

  UPDATE public.workflow_runs
     SET billing_status = 'released'
   WHERE id = p_run_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'released',
    'reserved', v_reserved, 'limit', v_limit, 'released', v_reserved_run);
END;
$$;

-- 3e. release_expired_reservations_v2 — sweep, decrements account_billing by the
--     run's account_id directly (no owner recovery needed; account_billing IS
--     keyed by account). FOR UPDATE OF wr locks only the run rows.
CREATE OR REPLACE FUNCTION public.release_expired_reservations_v2(
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_tasks int := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT wr.id,
           wr.account_id,
           COALESCE(wr.reserved_task_cost, 0) AS amount
      FROM public.workflow_runs wr
     WHERE wr.billing_status = 'reserved'
       AND wr.reservation_expires_at IS NOT NULL
       AND wr.reservation_expires_at < p_now
     FOR UPDATE OF wr
  LOOP
    UPDATE public.account_billing
       SET tasks_reserved = GREATEST(0, tasks_reserved - r.amount)
     WHERE account_id = r.account_id;

    UPDATE public.workflow_runs
       SET billing_status = 'released'
     WHERE id = r.id;

    v_count := v_count + 1;
    v_tasks := v_tasks + r.amount;
  END LOOP;

  RETURN jsonb_build_object('ok', true,
    'released_count', v_count, 'released_tasks', v_tasks);
END;
$$;

-- ── 4. Grants — service_role only (same posture as the user-keyed RPCs) ──────

REVOKE ALL ON FUNCTION public.deduct_tasks_if_available_v2(uuid, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_tasks_if_available_v2(uuid, int, uuid, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_task_reservation_v2(uuid, uuid, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_task_reservation_v2(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_reservations_v2(timestamptz) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.deduct_tasks_if_available_v2(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_tasks_if_available_v2(uuid, int, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_task_reservation_v2(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_task_reservation_v2(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations_v2(timestamptz) TO service_role;
