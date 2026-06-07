-- ChainReactV2 — atomic Team → Business upgrade primitive
-- (Slice 4.BILLING-BUSINESS-UPGRADE-2 / BU-1).
--
-- The webhook (BU-3, later) is the sole caller. This RPC flips ONE Team account to the
-- internal `organization` type AND sets its account_billing row to the `business` plan in a
-- SINGLE transaction, so the system never observes the half-applied state plan='business'
-- while accounts.type='team' (member/folder caps are DERIVED from accounts.type — a mismatch
-- would mis-size them). It creates NO account, migrates NO workflows/folders/integrations/
-- API keys, touches NO members, and changes NO owner. Downgrade is NOT implemented here.
--
-- SECURITY: SECURITY DEFINER + fixed search_path; service-role ONLY (REVOKE from public/anon/
-- authenticated, GRANT EXECUTE to service_role) — mirrors the existing billing RPCs. There is
-- no client write path to accounts.type / account_billing.plan; this RPC is the only upgrade
-- writer. It re-validates server-side (account exists, not frozen, currently `team`) so a
-- caller cannot escalate an arbitrary account.
--
-- IDEMPOTENT / replay-safe (Stripe retries later): acts only when accounts.type='team'. An
-- account already 'organization' is a no-op (applied=false, reason='already_upgraded'); a
-- 'personal' account is rejected (not_upgradeable); a missing or frozen account is rejected
-- without any write. Re-validation + the `type='team'` UPDATE guard make a concurrent replay
-- safe.
--
-- p_tasks_limit is supplied by the caller (the repo wrapper defaults it from
-- core/billing/planPolicy.planLimitsFor('business').taskLimit) so the task-cap policy stays
-- authoritative in TS — this SQL never hardcodes the number.
--
-- ROLLBACK (pre-launch, no prod Business accounts):
--   DROP FUNCTION public.apply_business_upgrade(uuid, text, timestamptz, boolean, text, text, int);

CREATE OR REPLACE FUNCTION public.apply_business_upgrade(
  p_account_id uuid,
  p_plan_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_tasks_limit int
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

  -- 2) Billing tier + Stripe attachment, in the SAME transaction.
  UPDATE public.account_billing
     SET plan = 'business',
         plan_status = p_plan_status,
         current_period_end = p_current_period_end,
         cancel_at_period_end = p_cancel_at_period_end,
         stripe_subscription_id = p_stripe_subscription_id,
         stripe_customer_id = p_stripe_customer_id,
         tasks_limit = p_tasks_limit
   WHERE account_id = p_account_id;

  RETURN jsonb_build_object(
    'ok', true, 'applied', true, 'reason', 'upgraded',
    'type', 'organization', 'plan', 'business'
  );
END;
$$;

-- Service-role only — never PUBLIC / anon / authenticated. The upgrade is a server-side
-- chokepoint (the BU-3 webhook), unreachable from the Data API.
REVOKE ALL ON FUNCTION public.apply_business_upgrade(uuid, text, timestamptz, boolean, text, text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_business_upgrade(uuid, text, timestamptz, boolean, text, text, int) TO service_role;
