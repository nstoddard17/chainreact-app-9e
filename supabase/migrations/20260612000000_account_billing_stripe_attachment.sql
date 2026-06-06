-- ChainReactV2 — account_billing Stripe attachment columns
-- (Slice 4.BILLING-PLAN-METADATA-3 / CS-2).
--
-- Additive Stripe ATTACHMENT foundation on the existing account-scoped billing root.
-- This slice adds the columns + uniqueness only. It wires NO checkout, NO customer
-- portal, NO Stripe webhook, NO subscription lifecycle, and NO payment behavior — those
-- land in CS-3+ behind ENABLE_PLATFORM_BILLING (default OFF). No customer is created
-- here (deferred to CS-3); every column is nullable and unset for existing rows.
--
-- Columns:
--   - stripe_customer_id      : the platform Stripe Customer for this account (one per
--                               account_id). Nullable until a checkout creates it (CS-3).
--   - stripe_subscription_id  : the account's current platform subscription. Nullable.
--   - cancel_at_period_end    : whether the subscription is set to cancel at period end.
--                               NOT NULL DEFAULT false (matches Stripe's default).
--   (current_period_end was already added in CS-1's plan-metadata migration.)
--   stripe_price_id is intentionally NOT added — the plan (§5 data model) does not store
--   an active-price snapshot; price is resolved from config at checkout time (CS-3).
--
-- Uniqueness: partial unique indexes (WHERE ... IS NOT NULL) guarantee one Stripe
-- customer and one subscription per account, while allowing MANY rows to share a NULL
-- (every account that has never paid). This makes idempotent customer creation safe in
-- CS-3 (a duplicate customer/subscription id insert is rejected by the index).
--
-- RLS / GRANTs: UNCHANGED. account_billing already has a membership-gated SELECT policy
-- + `GRANT SELECT TO authenticated` / all-to-service_role, and NO client write policy
-- (writes are service-role only). The new id columns inherit that posture:
--   * Writes stay service-role only — no authenticated write path exists, so a member
--     cannot set/alter their own Stripe ids.
--   * The Stripe ids are NOT exposed by the client-facing projection
--     (repositories/accountBilling.ts `getUsage` selects an explicit non-Stripe column
--     list; the dedicated read uses the service-role client). Account Settings never
--     renders raw Stripe ids.
--   * Stripe customer/subscription ids are non-secret REFERENCE identifiers, not
--     credentials — the only platform secret (STRIPE_SECRET_KEY) lives in env, never in
--     this table. A column-level GRANT restriction was considered and rejected: with the
--     existing table-level `GRANT SELECT TO authenticated`, a column-level REVOKE is
--     ineffective in Postgres (the table grant supersedes it), so hiding the columns
--     would require revoking the table grant and enumerating per-column grants — fragile
--     (a future column silently hidden) and contrary to the plan's "RLS/GRANT unchanged".
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.account_billing_stripe_subscription_idx;
--   DROP INDEX IF EXISTS public.account_billing_stripe_customer_idx;
--   ALTER TABLE public.account_billing
--     DROP COLUMN cancel_at_period_end,
--     DROP COLUMN stripe_subscription_id,
--     DROP COLUMN stripe_customer_id;

ALTER TABLE public.account_billing
  ADD COLUMN stripe_customer_id text,
  ADD COLUMN stripe_subscription_id text,
  ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;

-- One Stripe customer per account (NULLs allowed for never-paid accounts).
CREATE UNIQUE INDEX account_billing_stripe_customer_idx
  ON public.account_billing (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- One Stripe subscription per account (NULLs allowed).
CREATE UNIQUE INDEX account_billing_stripe_subscription_idx
  ON public.account_billing (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
