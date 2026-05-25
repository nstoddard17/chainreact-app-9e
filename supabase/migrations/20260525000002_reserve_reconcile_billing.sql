-- ChainReactV2 — reserve/reconcile billing schema + atomic RPC foundation (Slice 4.COST-12).
--
-- Adds the DATABASE FOUNDATION for the reserve -> execute -> reconcile billing
-- model designed in docs/slices/phase-4/reserve-reconcile-billing-design.md
-- (COST-11). FOUNDATION ONLY — nothing calls these RPCs yet:
--   - The engine is NOT wired to reserve/reconcile.
--   - Live billing is UNCHANGED — real runs still flat-deduct 1 task via
--     deduct_tasks_if_available (Slice 1N), test/dry-run skipped (COST-2A).
--   - deduct_tasks_if_available is intentionally LEFT UNTOUCHED (the rollout
--     keeps it as the fallback path until COST-17).
--
-- Service wrappers land in COST-13 (behind a flag, off); engine integration +
-- shadow mode in COST-14. See the design doc §11 for the rollout.
--
-- Caller contract (for COST-13/14): a reservation IS the run — these RPCs
-- mutate the per-run billing columns on public.workflow_runs, keyed by the run
-- id. The caller MUST ensure the workflow_runs row exists before reserving
-- (today the engine writes the run row at finalize; COST-14 must create it at
-- reserve time). This honors COST-11's "reservation = the run, no separate
-- task_reservations table in v1" decision.
--
-- Period reset: there is NO period-reset job in the DB today (audited: only
-- user_billing's period_started_at column exists; nothing zeroes tasks_used).
-- WHEN a reset job is added, it MUST also zero tasks_reserved and release any
-- in-flight holds (or rely on the expiry sweep below). Documented here so the
-- future reset slice doesn't silently strand reserved tasks.

-- ── 1. user_billing: authoritative reserved-task counter ─────────────────────
--
-- available = tasks_limit - tasks_used - tasks_reserved. A REAL column (not a
-- ledger sum) is required so the reserve check is a single atomic predicate
-- under the row lock — ledger events alone cannot prevent concurrent overspend.
-- Defaults to 0 so every existing user is unaffected and flat billing keeps
-- working. The non-negativity invariant is a column CHECK; the
-- used + reserved <= limit invariant is enforced by the reserve RPC predicate.

ALTER TABLE public.user_billing
  ADD COLUMN tasks_reserved int NOT NULL DEFAULT 0
    CONSTRAINT user_billing_tasks_reserved_nonneg CHECK (tasks_reserved >= 0);

-- ── 2. workflow_runs: per-run reservation / reconcile state ──────────────────
--
-- All nullable: existing rows + flat-billed runs leave them NULL and are NOT
-- reinterpreted as reserve/reconcile billed. No backfill. billing_status NULL
-- means "no reservation lifecycle" (legacy / flat). workflow_runs is
-- grandfathered (existing table) — no new GRANTs needed.

ALTER TABLE public.workflow_runs
  ADD COLUMN reserved_task_cost     int,
  ADD COLUMN reconciled_task_cost   int,
  ADD COLUMN billing_status         text,
  ADD COLUMN reservation_id         uuid,
  ADD COLUMN reservation_expires_at timestamptz,
  ADD COLUMN billing_reconciled_at  timestamptz,
  ADD CONSTRAINT workflow_runs_billing_status_chk CHECK (
    billing_status IS NULL
    OR billing_status IN ('reserved', 'reconciled', 'released', 'failed')
  );

-- Sweep index: find expired in-flight holds cheaply (release_expired_reservations).
CREATE INDEX workflow_runs_billing_expiry_idx
  ON public.workflow_runs (reservation_expires_at)
  WHERE billing_status = 'reserved' AND reservation_expires_at IS NOT NULL;

-- ── 3. task_usage_events: idempotency (prevent duplicate ledger rows) ─────────
--
-- node_id is NULL for run-level events (run_estimate_recorded, billing_*) and
-- set for node-level events (node_task_charged), so a single multi-column
-- unique index can't cleanly span both (NULLs are distinct in a UNIQUE index).
-- Two PARTIAL unique indexes instead:
--   - run-level:  one (user, run, event_type) where node_id IS NULL
--   - node-level: one (user, run, node, event_type) where node_id IS NOT NULL
-- Both require workflow_run_id IS NOT NULL. Future internal_poll events that may
-- lack a run id are deliberately left UNCONSTRAINED (no natural idempotency key
-- yet) so we don't block legitimate repeated poll-cost rows.
--
-- Existing data is unique under these keys (one estimate row + one charge row
-- per node per run; a retry is a new run id), so the indexes build cleanly.

CREATE UNIQUE INDEX task_usage_events_run_level_idem
  ON public.task_usage_events (user_id, workflow_run_id, event_type)
  WHERE workflow_run_id IS NOT NULL AND node_id IS NULL;

CREATE UNIQUE INDEX task_usage_events_node_level_idem
  ON public.task_usage_events (user_id, workflow_run_id, node_id, event_type)
  WHERE workflow_run_id IS NOT NULL AND node_id IS NOT NULL;

-- ── 4. reserve_tasks_if_available ────────────────────────────────────────────
--
-- Atomically hold p_amount tasks for run p_run_id. Race-safe: the capacity
-- predicate (tasks_used + tasks_reserved + p_amount <= tasks_limit) is part of
-- the UPDATE WHERE clause so the row lock makes check-and-write atomic — two
-- concurrent runs can never collectively over-reserve.
--
-- Idempotent on the run's billing_status: a run already reserved/reconciled/
-- released returns its current state without a second mutation. p_amount = 0
-- succeeds without touching the balance (reserve 0). Insufficient capacity
-- marks the run 'failed' and returns ok:false (caller surfaces BILLING_EXHAUSTED).
--
-- Returns jsonb {ok, reason, used, reserved, limit, amount}.

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

  -- The reservation lives on the run row. Caller must have created it.
  SELECT billing_status, reserved_task_cost
    INTO v_status, v_reserved_run
    FROM public.workflow_runs
   WHERE id = p_run_id AND user_id = p_user_id;

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

-- ── 5. reconcile_task_reservation ────────────────────────────────────────────
--
-- After a run, convert its hold into a charge: charge = least(p_actual,
-- reserved), refund = reserved - charge. tasks_used += charge,
-- tasks_reserved -= reserved (the whole hold). Idempotent on billing_status:
-- a second call on a reconciled run returns the stored result. p_actual >
-- reserved is clamped (cannot happen in v1; defense in depth) and flagged via
-- reason 'reconcile_over_reserve'.
--
-- Returns jsonb {ok, reason, used, reserved, limit, charged, refunded}.

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

  SELECT billing_status, reserved_task_cost, reconciled_task_cost
    INTO v_status, v_reserved_run, v_reconciled_run
    FROM public.workflow_runs
   WHERE id = p_run_id AND user_id = p_user_id;

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

-- ── 6. release_task_reservation ──────────────────────────────────────────────
--
-- Release a full hold WITHOUT charging (fatal-before-execution / cancellation).
-- tasks_reserved -= reserved; billing_status = 'released'. Idempotent: a run
-- already released/reconciled returns its state without a second mutation; a
-- run with no active hold (NULL/'failed') is a no-op ok:true released:0.
--
-- Returns jsonb {ok, reason, reserved, limit, released}.

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
  SELECT billing_status, reserved_task_cost
    INTO v_status, v_reserved_run
    FROM public.workflow_runs
   WHERE id = p_run_id AND user_id = p_user_id;

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

-- ── 7. release_expired_reservations ──────────────────────────────────────────
--
-- Sweep orphaned holds: runs stuck in 'reserved' past reservation_expires_at
-- (engine crashed between reserve and reconcile). Decrements each owner's
-- tasks_reserved and marks the run 'released'. Idempotent (re-running finds
-- none). Service/cron intended.
--
-- Returns jsonb {ok, released_count, released_tasks}.

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
    SELECT id, user_id, COALESCE(reserved_task_cost, 0) AS amount
      FROM public.workflow_runs
     WHERE billing_status = 'reserved'
       AND reservation_expires_at IS NOT NULL
       AND reservation_expires_at < p_now
     FOR UPDATE
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

-- ── 8. Grants ────────────────────────────────────────────────────────────────
--
-- All four RPCs mutate balances and run as SECURITY DEFINER (owner) so they
-- bypass RLS; the explicit grant is the auth boundary. service_role only —
-- never anon/authenticated (same posture as deduct_tasks_if_available; a user
-- must never mutate their own reserved/used counters directly).

REVOKE ALL ON FUNCTION public.reserve_tasks_if_available(uuid, int, uuid, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_task_reservation(uuid, uuid, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_task_reservation(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_reservations(timestamptz) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_tasks_if_available(uuid, int, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_task_reservation(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_task_reservation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations(timestamptz) TO service_role;
