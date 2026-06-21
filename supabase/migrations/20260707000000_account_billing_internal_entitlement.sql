-- ChainReactV2 — account_billing internal entitlement
-- (Slice 4.BILLING-INTERNAL-ENTITLEMENT-1 / BIE-1).
--
-- Account-level internal billing entitlement. Lets EXPLICITLY-marked internal /
-- test / employee / demo accounts bypass the task-deduction gate and the Stripe
-- checkout / portal requirement, WITHOUT weakening normal production billing.
--
--   - This is ACCOUNT-level, not user-level. "Admin user" never globally bypasses
--     billing; only an account whose billing row is marked `internal_free` does.
--   - Billing still resolves from the workflow's owning account (account_billing
--     is account-keyed), so the entitlement is account-scoped by construction.
--   - Safe default `standard`: every existing + future row is billed normally
--     unless someone explicitly flips it.
--   - No Stripe state is faked. internal_free accounts simply skip checkout; their
--     stripe_customer_id / stripe_subscription_id stay null.
--
-- Columns (all additive, null-safe; no limit / RLS / GRANT change):
--   - billing_mode            : 'standard' (billed) | 'internal_free' (bypass). NOT
--                               NULL DEFAULT 'standard' + CHECK to the known set.
--   - internal_reason         : why the account is internal (nullable enum-as-CHECK).
--   - internal_set_by_user_id : the user who flipped it (audit provenance; nullable;
--                               FK auth.users ON DELETE SET NULL so deleting the
--                               actor never blocks or corrupts the billing row).
--   - internal_set_at         : when it was flipped (nullable).
--
-- Consistency CHECK: a `standard` row MUST carry no internal metadata (all three
-- internal_* fields null). This keeps reverted accounts clean and makes "is this
-- account internal?" answerable from billing_mode alone. The service-role helpers
-- always write the four columns together so the invariant holds. internal_free
-- rows MAY carry the metadata but do not require it (fields stay nullable).
--
-- RLS / GRANTs are UNCHANGED: account_billing already has a membership-gated SELECT
-- policy + `GRANT SELECT TO authenticated` / all-to-service_role. These columns are
-- privileged FLAGS, not secrets — they are deliberately NOT added to the
-- client-facing getUsage projection (no read path exposes the bypass), and there is
-- NO client write policy, so the toggle is service-role only (no public/client
-- toggle). Writes flow exclusively through the BIE service-role helpers.
--
-- ROLLBACK (pre-launch, no prod data):
--   ALTER TABLE public.account_billing
--     DROP CONSTRAINT account_billing_internal_consistency,
--     DROP COLUMN internal_set_at,
--     DROP COLUMN internal_set_by_user_id,
--     DROP COLUMN internal_reason,
--     DROP COLUMN billing_mode;

ALTER TABLE public.account_billing
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'standard'
    CONSTRAINT account_billing_billing_mode_known
    CHECK (billing_mode IN ('standard', 'internal_free')),
  ADD COLUMN internal_reason text
    CONSTRAINT account_billing_internal_reason_known
    CHECK (
      internal_reason IS NULL
      OR internal_reason IN ('employee', 'qa', 'demo', 'load_test', 'partner', 'other')
    ),
  ADD COLUMN internal_set_by_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN internal_set_at timestamptz;

-- A standard account must carry no internal metadata (clean revert invariant).
ALTER TABLE public.account_billing
  ADD CONSTRAINT account_billing_internal_consistency
  CHECK (
    billing_mode = 'internal_free'
    OR (
      internal_reason IS NULL
      AND internal_set_by_user_id IS NULL
      AND internal_set_at IS NULL
    )
  );
