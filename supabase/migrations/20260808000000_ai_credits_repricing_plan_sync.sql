-- ChainReactV2 — AI credit repricing + plan-sync completion (AI-CREDITS-REPRICE-1).
--
-- Owner decision (2026-07-27): AI is a core included benefit, not a scarce add-on.
-- New monthly allocations: Free 100 / Pro 2,000 / Team 10,000 / Business 50,000 /
-- Enterprise custom. Per-included-seat credits never fall below Pro's
-- (Pro 2,000/seat · Team 10,000/5 · Business 50,000/25 — all exactly 2,000/seat).
-- Policy source of truth: core/billing/planPolicy.ts (PLAN_LIMITS.aiCreditsMonthlyLimit);
-- this SQL mirrors those numbers the same way the tasks_limit stamps do.
--
-- This migration also CLOSES the plan-sync gap left by 20260621000000: that
-- migration backfilled ai_credits_limit once and set a column DEFAULT of 20, but
-- nothing stamped the column on plan activation, team-account creation, or the
-- business upgrade/downgrade RPCs — so an account upgrading to Pro kept the Free
-- allocation. The TS side (stripeBillingWebhook.applyResolvedPlan,
-- initAccountBillingServiceRole) now stamps from policy; here the two atomic
-- shape+plan RPCs gain a p_ai_credits_limit parameter (caller-supplied from
-- policy — this SQL never hardcodes the per-plan number in the RPCs).
--
-- Backfill safety: the re-stamp below only touches NON-ENTERPRISE rows whose
-- current limit equals one of the KNOWN OLD DEFAULTS (20 / 500 / 2000 / 10000).
-- That repairs both rows still on their old plan default AND rows stuck at 20 by
-- the stamping gap, while any hand-set custom value (and every enterprise
-- per-deal value, incl. the 1000000 placeholder) survives untouched.
--
-- SECURITY: no new tables; the RPC replacements keep SECURITY DEFINER + pinned
-- search_path + service_role-only grants. Old single-signature functions are
-- DROPped so no stale overload remains callable.

-- ── 1. New-row default: a trigger-seeded personal (free) row is born at 100 ──
ALTER TABLE public.account_billing
  ALTER COLUMN ai_credits_limit SET DEFAULT 100;

-- ── 2. Guarded re-stamp of existing rows (custom values survive) ─────────────
UPDATE public.account_billing
   SET ai_credits_limit = CASE plan
         WHEN 'free'     THEN 100
         WHEN 'pro'      THEN 2000
         WHEN 'team'     THEN 10000
         WHEN 'business' THEN 50000
         ELSE ai_credits_limit
       END
 WHERE plan IN ('free', 'pro', 'team', 'business')
   AND ai_credits_limit IN (20, 500, 2000, 10000);

-- ── 3. apply_business_upgrade: + p_ai_credits_limit (drop old signature) ─────
DROP FUNCTION IF EXISTS public.apply_business_upgrade(uuid, text, timestamptz, boolean, text, text, int);

CREATE OR REPLACE FUNCTION public.apply_business_upgrade(
  p_account_id uuid,
  p_plan_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_tasks_limit int,
  p_ai_credits_limit int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_deletion text;
BEGIN
  -- Validate the status up front (the account_billing CHECK also enforces it, but a clean
  -- error beats a constraint violation for an out-of-set value).
  IF p_plan_status NOT IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete') THEN
    RAISE EXCEPTION 'apply_business_upgrade: invalid plan_status %', p_plan_status;
  END IF;

  -- Lock the account row for the duration of the transaction.
  SELECT type, deletion_status
    INTO v_type, v_deletion
    FROM public.accounts
   WHERE id = p_account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'applied', false, 'reason', 'account_not_found');
  END IF;

  IF v_deletion = 'pending_deletion' THEN
    RETURN jsonb_build_object('ok', false, 'applied', false, 'reason', 'account_frozen');
  END IF;

  -- Idempotent: already upgraded → no-op (billing sync for an org account is the normal
  -- webhook path, not this primitive).
  IF v_type = 'organization' THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'already_upgraded');
  END IF;

  -- Only a Team account can upgrade to Business in place.
  IF v_type <> 'team' THEN
    RETURN jsonb_build_object('ok', false, 'applied', false, 'reason', 'not_upgradeable');
  END IF;

  -- Ensure the billing row exists (it normally does for a team account).
  INSERT INTO public.account_billing (account_id)
    VALUES (p_account_id)
    ON CONFLICT (account_id) DO NOTHING;

  -- 1) Structural shape: team → organization (user-facing "Business"). Guarded on type.
  UPDATE public.accounts
     SET type = 'organization'
   WHERE id = p_account_id
     AND type = 'team';

  -- 2) Billing tier + Stripe attachment + caps, in the SAME transaction.
  UPDATE public.account_billing
     SET plan = 'business',
         plan_status = p_plan_status,
         current_period_end = p_current_period_end,
         cancel_at_period_end = p_cancel_at_period_end,
         stripe_subscription_id = p_stripe_subscription_id,
         stripe_customer_id = p_stripe_customer_id,
         tasks_limit = p_tasks_limit,
         ai_credits_limit = p_ai_credits_limit
   WHERE account_id = p_account_id;

  RETURN jsonb_build_object(
    'ok', true, 'applied', true, 'reason', 'upgraded',
    'type', 'organization', 'plan', 'business'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_business_upgrade(uuid, text, timestamptz, boolean, text, text, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_business_upgrade(uuid, text, timestamptz, boolean, text, text, int, int) TO service_role;

-- ── 4. apply_business_downgrade: + p_ai_credits_limit (drop old signature) ───
DROP FUNCTION IF EXISTS public.apply_business_downgrade(uuid, text, int);

CREATE OR REPLACE FUNCTION public.apply_business_downgrade(
  p_account_id uuid,
  p_plan_status text,
  p_tasks_limit int,
  p_ai_credits_limit int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_deletion text;
BEGIN
  -- Validate the status up front (the account_billing CHECK also enforces it, but a clean
  -- error beats a constraint violation for an out-of-set value).
  IF p_plan_status NOT IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete') THEN
    RAISE EXCEPTION 'apply_business_downgrade: invalid plan_status %', p_plan_status;
  END IF;

  -- Lock the account row for the duration of the transaction.
  SELECT type, deletion_status
    INTO v_type, v_deletion
    FROM public.accounts
   WHERE id = p_account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'applied', false, 'reason', 'account_not_found');
  END IF;

  IF v_deletion = 'pending_deletion' THEN
    RETURN jsonb_build_object('ok', false, 'applied', false, 'reason', 'account_frozen');
  END IF;

  -- Idempotent: already a team account → no-op (billing sync for a team account is the normal
  -- webhook path, not this primitive).
  IF v_type = 'team' THEN
    RETURN jsonb_build_object('ok', true, 'applied', false, 'reason', 'already_team');
  END IF;

  -- Only a Business (organization) account can downgrade to Team in place.
  IF v_type <> 'organization' THEN
    RETURN jsonb_build_object('ok', false, 'applied', false, 'reason', 'not_downgradeable');
  END IF;

  -- Ensure the billing row exists (it normally does for an organization account).
  INSERT INTO public.account_billing (account_id)
    VALUES (p_account_id)
    ON CONFLICT (account_id) DO NOTHING;

  -- 1) Structural shape: organization → team. Guarded on type.
  UPDATE public.accounts
     SET type = 'team'
   WHERE id = p_account_id
     AND type = 'organization';

  -- 2) Billing tier + status + caps, in the SAME transaction. Stripe attachment columns
  --    (customer/subscription/period/cancel) are intentionally LEFT UNTOUCHED.
  UPDATE public.account_billing
     SET plan = 'team',
         plan_status = p_plan_status,
         tasks_limit = p_tasks_limit,
         ai_credits_limit = p_ai_credits_limit
   WHERE account_id = p_account_id;

  RETURN jsonb_build_object(
    'ok', true, 'applied', true, 'reason', 'downgraded',
    'type', 'team', 'plan', 'team'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_business_downgrade(uuid, text, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_business_downgrade(uuid, text, int, int) TO service_role;
