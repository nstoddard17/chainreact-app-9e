-- ChainReactV2 — reserve/reconcile RPC hygiene fix (Slice 4.ACCOUNT-MODEL-9a).
--
-- WHY ─────────────────────────────────────────────────────────────────────────
-- The four reserve/reconcile RPCs defined in
-- 20260525000002_reserve_reconcile_billing.sql look the owning run up by
-- `workflow_runs.user_id`:
--     WHERE id = p_run_id AND user_id = p_user_id          (reserve/reconcile/release)
--     SELECT id, user_id, ... FROM workflow_runs ...        (release_expired_reservations)
--
-- Phase B's workflow_runs account cutover (20260530000004_workflow_runs_account_cutover.sql,
-- slice 4.ACCOUNT-MODEL-8) DROPPED workflow_runs.user_id. Those RPC bodies now
-- reference a column that no longer exists, so each errors with
-- `column "user_id" does not exist` the moment it runs against the migrated
-- schema. The reserve/reconcile/release RPCs are dormant (gated off behind
-- ENABLE_RESERVE_RECONCILE_BILLING + foundation-only), but
-- release_expired_reservations is invoked by the UN-gated cron
-- /api/cron/release-expired-reservations every 10 minutes, so this is a live
-- broken path on the migrated schema (the -8 scope-fence comment that claimed
-- the RPCs were "untouched" was a documentation error).
--
-- WHAT ────────────────────────────────────────────────────────────────────────
-- This slice ONLY repairs the broken column reference. Billing ownership stays
-- USER-SCOPED: user_billing is still keyed on user_id, the RPC signatures still
-- take p_user_id, and the balance math is byte-for-byte identical. Phase C
-- (4.ACCOUNT-MODEL-9b+) is what re-keys billing to account_id — NOT this slice.
--
-- The fix recovers/verifies the run's owning user through the SURVIVING
-- ownership column. workflow_runs is now account-owned (workflow_runs.account_id,
-- NOT NULL, FK accounts), so the run's billed user is the personal account's
-- owner: accounts.owner_user_id. (triggered_by_user_id is the actor-provenance
-- column, NOT an ownership key — it is NULL for webhook/polling/cron/scheduled
-- runs, so it cannot stand in for the dropped user_id. owner_user_id is the
-- correct surviving field.) For personal accounts owner_user_id is exactly the
-- user the engine threads today (workflow.createdByUserId == accounts.owner_user_id),
-- so the original "this run belongs to the billed user" guard is preserved
-- exactly — only the join path changes.
--
-- No table, column, RLS policy, grant model, or signature changes. CREATE OR
-- REPLACE keeps the existing service_role-only EXECUTE grants; they are
-- re-asserted at the end as defense in depth (idempotent).
--
-- See docs/slices/phase-4/account-billing-rescope-plan.md §"Recommended
-- implementation slices → 4.ACCOUNT-MODEL-9a".
--
-- ROLLBACK ──────────────────────────────────────────────────────────────────
-- git revert the code/migration commit, then re-apply the original four RPC
-- bodies from 20260525000002 — only meaningful if workflow_runs.user_id is also
-- restored (it is not; -8 dropped it), so in practice the fix is forward-only:
-- a botched fix is corrected forward, never by reinstating the broken bodies.

-- ── 1. reserve_tasks_if_available ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_tasks_if_available(
  p_user_id uuid,
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
    RAISE EXCEPTION 'reserve_tasks_if_available: p_amount must be >= 0 (got %)', p_amount;
  END IF;

  -- Materialize the billing row if missing (mirrors deduct_tasks_if_available).
  INSERT INTO public.user_billing (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  -- The reservation lives on the run row. Caller must have created it. The run
  -- is account-owned (Phase B); recover the billed user via the account owner
  -- (was: workflow_runs.user_id, dropped in -8).
  SELECT wr.billing_status, wr.reserved_task_cost
    INTO v_status, v_reserved_run
    FROM public.workflow_runs wr
    JOIN public.accounts a ON a.id = wr.account_id
   WHERE wr.id = p_run_id AND a.owner_user_id = p_user_id;

  IF NOT FOUND THEN
    SELECT tasks_used, tasks_reserved, tasks_limit
      INTO v_used, v_reserved, v_limit
      FROM public.user_billing WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_found',
      'used', v_used, 'reserved', v_reserved, 'limit', v_limit, 'amount', p_amount);
  END IF;

  -- Idempotent: already in a reservation lifecycle state.
  IF v_status IN ('reserved', 'reconciled', 'released') THEN
    SELECT tasks_used, tasks_reserved, tasks_limit
      INTO v_used, v_reserved, v_limit
      FROM public.user_billing WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'already_' || v_status,
      'used', v_used, 'reserved', v_reserved, 'limit', v_limit,
      'amount', COALESCE(v_reserved_run, 0));
  END IF;

  -- Reserve 0: no balance change, just stamp the run as reserved.
  IF p_amount = 0 THEN
    UPDATE public.workflow_runs
       SET reserved_task_cost = 0,
           billing_status = 'reserved',
           reservation_id = COALESCE(reservation_id, p_run_id),
           reservation_expires_at = p_expires_at
     WHERE id = p_run_id;
    SELECT tasks_used, tasks_reserved, tasks_limit
      INTO v_used, v_reserved, v_limit
      FROM public.user_billing WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'reserved',
      'used', v_used, 'reserved', v_reserved, 'limit', v_limit, 'amount', 0);
  END IF;

  -- Atomic capacity hold.
  UPDATE public.user_billing
     SET tasks_reserved = tasks_reserved + p_amount
   WHERE user_id = p_user_id
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

  -- Insufficient capacity — mark the run's reservation failed, mutate nothing.
  UPDATE public.workflow_runs
     SET billing_status = 'failed'
   WHERE id = p_run_id;
  SELECT tasks_used, tasks_reserved, tasks_limit
    INTO v_used, v_reserved, v_limit
    FROM public.user_billing WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_tasks',
    'used', v_used, 'reserved', v_reserved, 'limit', v_limit, 'amount', p_amount);
END;
$$;

-- ── 2. reconcile_task_reservation ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reconcile_task_reservation(
  p_user_id uuid,
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
    RAISE EXCEPTION 'reconcile_task_reservation: p_actual must be >= 0 (got %)', p_actual;
  END IF;

  -- Recover the billed user via the run's account owner (was: workflow_runs.user_id).
  SELECT wr.billing_status, wr.reserved_task_cost, wr.reconciled_task_cost
    INTO v_status, v_reserved_run, v_reconciled_run
    FROM public.workflow_runs wr
    JOIN public.accounts a ON a.id = wr.account_id
   WHERE wr.id = p_run_id AND a.owner_user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_found');
  END IF;

  -- Idempotent: already reconciled.
  IF v_status = 'reconciled' THEN
    SELECT tasks_used, tasks_reserved, tasks_limit
      INTO v_used, v_reserved, v_limit
      FROM public.user_billing WHERE user_id = p_user_id;
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

  UPDATE public.user_billing
     SET tasks_used = tasks_used + v_charge,
         tasks_reserved = GREATEST(0, tasks_reserved - v_reserved_run)
   WHERE user_id = p_user_id
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

-- ── 3. release_task_reservation ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_task_reservation(
  p_user_id uuid,
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
  -- Recover the billed user via the run's account owner (was: workflow_runs.user_id).
  SELECT wr.billing_status, wr.reserved_task_cost
    INTO v_status, v_reserved_run
    FROM public.workflow_runs wr
    JOIN public.accounts a ON a.id = wr.account_id
   WHERE wr.id = p_run_id AND a.owner_user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_found');
  END IF;

  -- Idempotent: already in a terminal billing state.
  IF v_status IN ('released', 'reconciled') THEN
    SELECT tasks_reserved, tasks_limit INTO v_reserved, v_limit
      FROM public.user_billing WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'already_' || v_status,
      'reserved', v_reserved, 'limit', v_limit, 'released', 0);
  END IF;

  -- No active hold (NULL / 'failed') — nothing to release.
  IF v_status IS DISTINCT FROM 'reserved' THEN
    SELECT tasks_reserved, tasks_limit INTO v_reserved, v_limit
      FROM public.user_billing WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'nothing_to_release',
      'reserved', v_reserved, 'limit', v_limit, 'released', 0);
  END IF;

  v_reserved_run := COALESCE(v_reserved_run, 0);

  UPDATE public.user_billing
     SET tasks_reserved = GREATEST(0, tasks_reserved - v_reserved_run)
   WHERE user_id = p_user_id
   RETURNING tasks_reserved, tasks_limit
   INTO v_reserved, v_limit;

  UPDATE public.workflow_runs
     SET billing_status = 'released'
   WHERE id = p_run_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'released',
    'reserved', v_reserved, 'limit', v_limit, 'released', v_reserved_run);
END;
$$;

-- ── 4. release_expired_reservations ──────────────────────────────────────────
--
-- The sweep has no p_user_id; it must recover each expired run's billed user to
-- decrement the right user_billing row. Recover via the run's account owner
-- (was: the now-dropped workflow_runs.user_id selected directly). FOR UPDATE OF
-- wr locks only the workflow_runs rows, not the joined accounts rows.

CREATE OR REPLACE FUNCTION public.release_expired_reservations(
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
           a.owner_user_id AS user_id,
           COALESCE(wr.reserved_task_cost, 0) AS amount
      FROM public.workflow_runs wr
      JOIN public.accounts a ON a.id = wr.account_id
     WHERE wr.billing_status = 'reserved'
       AND wr.reservation_expires_at IS NOT NULL
       AND wr.reservation_expires_at < p_now
     FOR UPDATE OF wr
  LOOP
    UPDATE public.user_billing
       SET tasks_reserved = GREATEST(0, tasks_reserved - r.amount)
     WHERE user_id = r.user_id;

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

-- ── 5. Re-assert grants (idempotent; CREATE OR REPLACE preserves them) ───────
--
-- service_role only — never anon/authenticated (same posture as the original
-- 20260525000002 definitions and deduct_tasks_if_available). A user must never
-- mutate their own reserved/used counters directly.

REVOKE ALL ON FUNCTION public.reserve_tasks_if_available(uuid, int, uuid, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_task_reservation(uuid, uuid, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_task_reservation(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_reservations(timestamptz) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_tasks_if_available(uuid, int, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_task_reservation(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_task_reservation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations(timestamptz) TO service_role;
