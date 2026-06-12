-- AI credit enforcement counters (Slice 4.AI-CREDITS-3, deduct-only, infra-only).
--
-- Plan: docs/slices/phase-4/ai-credits-enforcement-plan.md.
--
-- Moves AI credits from recording-only telemetry (AI-CREDITS-2, ai_cost_events
-- .ai_credits_charged) to an enforceable usage dimension that MIRRORS the task
-- counters, on the SAME account_billing row. ADDITIVE ONLY:
--   - adds ai_credits_limit / used / reserved + a SEPARATE ai_credits_period_started_at
--     anchor (so the live task RPCs are NOT touched — see the plan §6);
--   - backfills the per-plan limit on existing rows (placeholder numbers, owner-approved);
--   - adds ONE deduct RPC (flat gate + lazy AI-period rollover), mirroring
--     deduct_tasks_if_available (20260620000000).
--
-- NOT in this migration: reserve/reconcile RPCs, an ai_credit_reservations ledger,
-- any route wiring. Enforcement is gated OFF in code (ENABLE_AI_CREDIT_ENFORCEMENT);
-- this migration changes NO live billing behavior on its own (nothing calls the new
-- RPC until the gate is enabled + wired in a later slice).
--
-- Security: no CREATE TABLE (additive ALTER → inherits account_billing's RLS +
-- Data-API GRANTs; new columns need no separate grant). The RPC follows the
-- established SECURITY DEFINER + service_role-only grant pattern.

-- ── 1. AI credit counters on account_billing (additive) ──────────────────────
ALTER TABLE public.account_billing
  ADD COLUMN IF NOT EXISTS ai_credits_limit int NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS ai_credits_used int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_credits_reserved int NOT NULL DEFAULT 0
    CONSTRAINT account_billing_ai_credits_reserved_nonneg CHECK (ai_credits_reserved >= 0),
  ADD COLUMN IF NOT EXISTS ai_credits_period_started_at timestamptz NOT NULL DEFAULT now();

-- ── 2. Backfill existing rows ────────────────────────────────────────────────
-- Per-plan monthly AI credit limits (placeholders, AI-CREDITS-3 OQ-1 approved).
-- Mirrors how task limits are seeded from plan. Enterprise = custom; use a high
-- placeholder (effectively uncapped until a per-deal value is set), since the
-- NOT NULL int column has no "null/uncapped" representation (same as tasks_limit).
UPDATE public.account_billing
   SET ai_credits_limit = CASE plan
         WHEN 'free'       THEN 20
         WHEN 'pro'        THEN 500
         WHEN 'team'       THEN 2000
         WHEN 'business'   THEN 10000
         WHEN 'enterprise' THEN 1000000
         ELSE ai_credits_limit
       END;

-- Align each existing row's AI period anchor with its task period anchor so AI and
-- task months start together (both already anchored at account creation). New rows
-- use the column DEFAULT now() (same as period_started_at's default).
UPDATE public.account_billing
   SET ai_credits_period_started_at = period_started_at;

-- ── 3. deduct_ai_credits_if_available — flat gate + lazy AI-period rollover ───
-- Mirror of deduct_tasks_if_available (20260620000000), keyed on the AI counters +
-- the SEPARATE ai_credits_period_started_at anchor, reusing the IMMUTABLE
-- account_billing_period_start helper (unchanged). p_amount = 0 is a valid no-op
-- (a 0-credit/deterministic charge never blocks) — only a NEGATIVE amount is an error.
CREATE OR REPLACE FUNCTION public.deduct_ai_credits_if_available(
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
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'deduct_ai_credits_if_available: p_amount must be >= 0 (got %)', p_amount;
  END IF;

  INSERT INTO public.account_billing (account_id)
    VALUES (p_account_id)
    ON CONFLICT (account_id) DO NOTHING;

  -- Lazy AI-period rollover (locks the row; concurrent deducts roll over exactly once).
  -- ai_credits_limit is NEVER touched — a custom/plan-set cap survives the reset.
  -- Uses the AI anchor, NOT period_started_at, so the live task RPCs are untouched.
  SELECT ai_credits_period_started_at INTO v_anchor
    FROM public.account_billing
   WHERE account_id = p_account_id
     FOR UPDATE;
  v_new_start := public.account_billing_period_start(v_anchor, now());
  IF v_new_start > v_anchor THEN
    UPDATE public.account_billing
       SET ai_credits_used = 0,
           ai_credits_reserved = 0,
           ai_credits_period_started_at = v_new_start
     WHERE account_id = p_account_id;
  END IF;

  UPDATE public.account_billing
     SET ai_credits_used = ai_credits_used + p_amount
   WHERE account_id = p_account_id
     AND ai_credits_used + p_amount <= ai_credits_limit
   RETURNING ai_credits_used, ai_credits_limit
   INTO v_used, v_limit;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit);
  END IF;

  SELECT ai_credits_used, ai_credits_limit
    INTO v_used, v_limit
    FROM public.account_billing
   WHERE account_id = p_account_id;

  RETURN jsonb_build_object('ok', false, 'used', v_used, 'limit', v_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_ai_credits_if_available(uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_ai_credits_if_available(uuid, int) TO service_role;
