-- ChainReactV2 — atomic Business → Team downgrade primitive
-- (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-2 / CS-BD-1).
--
-- The LAST step of the explicit, owner-confirmed `downgradeBusinessToTeam` orchestration
-- (services/billing/businessDowngrade.ts). This RPC flips ONE Business account (internal
-- `organization`) back to the `team` type AND sets its account_billing row to the `team` plan in
-- a SINGLE transaction, so the system never observes the half-applied state plan='team' while
-- accounts.type='organization' (member/folder caps are DERIVED from accounts.type — a mismatch
-- would mis-size them). It is the mirror of `apply_business_upgrade` (BU-1).
--
-- SCOPE: this RPC ONLY flips type + billing tier/status/tasks_limit. The destructive workspace
-- simplification — removing non-owner members (via the existing offboarding sequence) and
-- flattening folders to Trash — happens in the TS orchestration BEFORE this call (those cascade
-- through services, not pure SQL). It creates/deletes NO members, folders, workflows, integrations,
-- API keys, or runs, and changes NO owner. There is NO over-cap / member-count / folder-count
-- refusal: the orchestration has already simplified the workspace, so there is nothing to refuse.
--
-- It deliberately does NOT touch stripe_customer_id / stripe_subscription_id / current_period_end /
-- cancel_at_period_end — the customer attachment is preserved (the customer is still needed for the
-- billing portal), and the subscription lifecycle is synced separately by the webhook (CS-BD-2).
--
-- SECURITY: SECURITY DEFINER + fixed search_path; service-role ONLY (REVOKE from public/anon/
-- authenticated, GRANT EXECUTE to service_role) — mirrors the existing billing RPCs. There is no
-- client write path to accounts.type / account_billing.plan. It re-validates server-side (account
-- exists, not frozen, currently `organization`) so a caller cannot demote an arbitrary account.
--
-- IDEMPOTENT / replay-safe: acts only when accounts.type='organization'. An account already 'team'
-- is a no-op (applied=false, reason='already_team'); a 'personal' account is rejected
-- (not_downgradeable); a missing or frozen account is rejected without any write. Re-validation +
-- the `type='organization'` UPDATE guard make a concurrent replay safe.
--
-- p_tasks_limit is supplied by the caller (the repo wrapper defaults it from
-- core/billing/planPolicy.planLimitsFor('team').taskLimit) so the task-cap policy stays
-- authoritative in TS — this SQL never hardcodes the number.
--
-- ROLLBACK (pre-launch, no prod Business accounts):
--   DROP FUNCTION public.apply_business_downgrade(uuid, text, int);

CREATE OR REPLACE FUNCTION public.apply_business_downgrade(
  p_account_id uuid,
  p_plan_status text,
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

  -- 2) Billing tier + status + task cap, in the SAME transaction. Stripe attachment columns
  --    (customer/subscription/period/cancel) are intentionally LEFT UNTOUCHED.
  UPDATE public.account_billing
     SET plan = 'team',
         plan_status = p_plan_status,
         tasks_limit = p_tasks_limit
   WHERE account_id = p_account_id;

  RETURN jsonb_build_object(
    'ok', true, 'applied', true, 'reason', 'downgraded',
    'type', 'team', 'plan', 'team'
  );
END;
$$;

-- Service-role only — never PUBLIC / anon / authenticated. The downgrade is a server-side
-- chokepoint (the owner-confirmed orchestration), unreachable from the Data API.
REVOKE ALL ON FUNCTION public.apply_business_downgrade(uuid, text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_business_downgrade(uuid, text, int) TO service_role;
