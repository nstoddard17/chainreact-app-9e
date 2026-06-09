-- Lazy task-period rollover (billing).
--
-- Problem (see docs/slices/phase-4/account-settings/plan-enforcement-and-task-period-audit.md):
-- `account_billing.tasks_used` never resets. `period_started_at` exists but nothing
-- advances or reads it, and there is no reset cron — so task caps behave as a
-- LIFETIME limit (Free exhausts after 100 runs ever, Pro after 1000), never monthly.
--
-- Fix: lazy, self-healing period rollover INSIDE the existing atomic deduct/reserve
-- RPCs. On each deduct/reserve, if the account's billing period has elapsed, reset
-- usage + reservations and advance `period_started_at` to the current period anchor
-- BEFORE the cap check — all under the same row lock, atomic with the mutation. No
-- cron, no lag window. The period is account/subscription anchored (period_started_at),
-- NOT calendar-month.
--
-- Scope: only `deduct_tasks_if_available` (the live path) and `reserve_tasks_if_available`
-- (the reserve entry point, flag-off today but kept consistent) gain rollover.
-- `reconcile_task_reservation` / `release_task_reservation` / `release_expired_reservations`
-- are unchanged — they already clamp `tasks_reserved` with GREATEST(0, …), so a
-- rollover that zeroes `tasks_reserved` cannot push them negative (old reservations
-- are simply forgiven, never leaking into the new period). No gate / PLAN_LIMITS /
-- Stripe behavior changes. Functions keep their existing service_role-only grants
-- (CREATE OR REPLACE preserves privileges).

-- ── 1. Period-anchor helper ──────────────────────────────────────────────────
--
-- Largest monthly anchor <= p_at, computed from the ORIGINAL anchor (p_anchor) so a
-- long-dormant account advances directly to the current period (not one month at a
-- time). Anchored to the anchor's day-of-month/time; month-end days clamp per
-- Postgres `make_interval` (e.g. Jan-31 anchor → Feb-28/29). Pure + deterministic.
CREATE OR REPLACE FUNCTION public.account_billing_period_start(
  p_anchor timestamptz,
  p_at timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_months int;
BEGIN
  IF p_at <= p_anchor THEN
    RETURN p_anchor;
  END IF;
  v_months :=
      (EXTRACT(YEAR FROM p_at)::int  - EXTRACT(YEAR FROM p_anchor)::int) * 12
    + (EXTRACT(MONTH FROM p_at)::int - EXTRACT(MONTH FROM p_anchor)::int);
  -- Back off a month if we haven't yet reached the anchor's day/time this month.
  IF p_anchor + make_interval(months => v_months) > p_at THEN
    v_months := v_months - 1;
  END IF;
  IF v_months < 0 THEN
    v_months := 0;
  END IF;
  RETURN p_anchor + make_interval(months => v_months);
END;
$$;

REVOKE ALL ON FUNCTION public.account_billing_period_start(timestamptz, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_billing_period_start(timestamptz, timestamptz) TO service_role;

-- ── 2. deduct_tasks_if_available — flat gate + lazy rollover ──────────────────
CREATE OR REPLACE FUNCTION public.deduct_tasks_if_available(
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
  v_anchor timestamptz;
  v_new_start timestamptz;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'deduct_tasks_if_available: p_amount must be positive (got %)', p_amount;
  END IF;

  INSERT INTO public.account_billing (account_id)
    VALUES (p_account_id)
    ON CONFLICT (account_id) DO NOTHING;

  -- Lazy period rollover (locks the row; concurrent deducts roll over exactly once).
  -- tasks_limit is NEVER touched — a custom/Stripe-set cap survives the reset.
  SELECT period_started_at INTO v_anchor
    FROM public.account_billing
   WHERE account_id = p_account_id
     FOR UPDATE;
  v_new_start := public.account_billing_period_start(v_anchor, now());
  IF v_new_start > v_anchor THEN
    UPDATE public.account_billing
       SET tasks_used = 0,
           tasks_reserved = 0,
           period_started_at = v_new_start
     WHERE account_id = p_account_id;
  END IF;

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

-- ── 3. reserve_tasks_if_available — reserve gate + lazy rollover ──────────────
CREATE OR REPLACE FUNCTION public.reserve_tasks_if_available(
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
  v_anchor timestamptz;
  v_new_start timestamptz;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'reserve_tasks_if_available: p_amount must be >= 0 (got %)', p_amount;
  END IF;

  INSERT INTO public.account_billing (account_id)
    VALUES (p_account_id)
    ON CONFLICT (account_id) DO NOTHING;

  -- Lazy period rollover (same rule as deduct). Zeroing tasks_reserved here means a
  -- reservation that outlived its period is forgiven; reconcile/release clamp with
  -- GREATEST(0, …) so they never underflow. tasks_limit is never touched.
  SELECT period_started_at INTO v_anchor
    FROM public.account_billing
   WHERE account_id = p_account_id
     FOR UPDATE;
  v_new_start := public.account_billing_period_start(v_anchor, now());
  IF v_new_start > v_anchor THEN
    UPDATE public.account_billing
       SET tasks_used = 0,
           tasks_reserved = 0,
           period_started_at = v_new_start
     WHERE account_id = p_account_id;
  END IF;

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
