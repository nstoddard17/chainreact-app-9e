-- ChainReactV2 — account_billing plan metadata
-- (Slice 4.BILLING-PLAN-METADATA-2 / CS-1).
--
-- Additive, null-safe plan metadata on the existing account-scoped billing root.
-- NO Stripe columns (stripe_customer_id / stripe_subscription_id are deferred to
-- CS-2), NO checkout, NO webhook, NO payment behavior, NO limit changes. The plan
-- tier is metadata; limits remain today's numbers (central policy in
-- core/billing/planPolicy.ts carries the same values).
--
-- Columns:
--   - plan          : the billing tier. NOT NULL DEFAULT 'free' + CHECK to the known
--                     set. New personal accounts (trigger-seeded) get 'free'; new
--                     team/org accounts get their type's default via
--                     initAccountBillingServiceRole.
--   - plan_status   : subscription lifecycle state. NOT NULL DEFAULT 'active' + CHECK.
--   - current_period_end : Stripe period end (nullable; set by the future webhook).
--
-- RLS / GRANTs are UNCHANGED: account_billing already has a membership-gated SELECT
-- policy + `GRANT SELECT TO authenticated` / all-to-service_role. The new columns are
-- NON-SECRET (plan / status / period) and inherit that posture — members may read
-- them; writes stay service-role only (no client write policy exists). No Stripe id
-- (which WOULD be sensitive) is added here.
--
-- ROLLBACK:
--   ALTER TABLE public.account_billing
--     DROP COLUMN current_period_end, DROP COLUMN plan_status, DROP COLUMN plan;

ALTER TABLE public.account_billing
  ADD COLUMN plan text NOT NULL DEFAULT 'free'
    CONSTRAINT account_billing_plan_known
    CHECK (plan IN ('free', 'pro', 'team', 'business', 'enterprise')),
  ADD COLUMN plan_status text NOT NULL DEFAULT 'active'
    CONSTRAINT account_billing_plan_status_known
    CHECK (plan_status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  ADD COLUMN current_period_end timestamptz;

-- Backfill existing rows to the plan that matches the account's structural type, so
-- the stored plan is truthful (personal → free, team → team, organization → business).
-- plan_status stays the 'active' default; current_period_end stays NULL.
UPDATE public.account_billing ab
   SET plan = CASE a.type
                WHEN 'personal' THEN 'free'
                WHEN 'team' THEN 'team'
                WHEN 'organization' THEN 'business'
                ELSE 'free'
              END
  FROM public.accounts a
 WHERE a.id = ab.account_id;
