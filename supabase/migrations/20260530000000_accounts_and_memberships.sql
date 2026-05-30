-- ChainReactV2 — accounts + account_memberships foundation.
--
-- Phase A of the V2 account ownership model
-- (docs/rules/account-ownership-model.md §19 + the implementation contract
-- at docs/slices/phase-4/account-model-foundation-plan.md).
--
-- This migration introduces the permanent ownership root: every user gets
-- a personal account at signup, every personal account has exactly one
-- owner membership, and the user / account deletion flow (not implemented
-- here) is the only legitimate path to remove an account.
--
-- Hard scope fences:
--   - `accounts.type` is CHECK-locked to 'personal' for now.
--   - `account_memberships.role` is CHECK-locked to 'owner' for now.
--   - No existing table is altered. workflows / integrations / workflow_runs
--     / user_billing all stay user_id-owned. Phase B+ cuts them over.
--
-- Load-bearing FK behavior:
--   - accounts.owner_user_id → ON DELETE RESTRICT (account root never
--     disappears implicitly when an auth user is deleted; deletion must
--     go through the user/account deletion flow that handles retention
--     grace, legal holds, billing wind-down, and — in Phase D — team/org
--     ownership-transfer checks).
--   - account_memberships.user_id → ON DELETE CASCADE (stale memberships
--     on team/org accounts clean up after the deletion flow removes the
--     user; for personal accounts the account itself stays under RESTRICT
--     until the flow explicitly removes it).
--   - account_memberships.account_id → ON DELETE CASCADE (memberships
--     follow the account when it's deleted via the flow).
--   - account_memberships.invited_by_user_id → ON DELETE SET NULL (a
--     deleted inviter's name nulls out rather than blocking the membership).
--
-- Statement order rationale:
--   1. Create both tables first (account_memberships has an FK to accounts,
--      and the accounts SELECT policy references account_memberships).
--   2. Enable RLS + grants on both tables.
--   3. Define the cross-referencing accounts SELECT policy.
--   4. Define the account_memberships SELECT policy + the personal-invariants trigger.
--   5. Backfill (after the trigger exists so the backfill exercises it).
--   6. Extend handle_new_user.

-- ── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('personal')),       -- relaxed in Phase D
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Exactly one personal account per user. The `WHERE type = 'personal'`
-- predicate lets Phase D introduce team/org accounts without this index
-- spuriously rejecting them.
CREATE UNIQUE INDEX accounts_one_personal_per_user
  ON public.accounts (owner_user_id)
  WHERE type = 'personal';

CREATE TABLE public.account_memberships (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner')),          -- relaxed in Phase D
  invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_id)
);

-- ── RLS + grants ───────────────────────────────────────────────────────────

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_memberships ENABLE ROW LEVEL SECURITY;

-- Data API access. Required after Supabase removes implicit grants
-- (new projects May 30, 2026; existing projects October 30, 2026).
-- RLS still gates row visibility — these grants only let the role
-- TOUCH the table.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_memberships TO service_role;

-- accounts reads: members can see accounts they belong to. INSERT / UPDATE /
-- DELETE policies are deliberately omitted at this slice — every write goes
-- through either the SECURITY DEFINER signup trigger or the service-role
-- backfill / ensurePersonalAccountServiceRole helper. Without policies the
-- session client (anon key) cannot write — default-deny.
CREATE POLICY accounts_select_member ON public.accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = accounts.id
    )
  );

-- account_memberships reads: a member sees their own membership row only.
-- Phase D will broaden this so members can see their teammates (the
-- predicate becomes a "same-account membership" EXISTS join). INSERT /
-- UPDATE / DELETE policies are omitted at this slice (writes happen via
-- the trigger or service-role).
CREATE POLICY account_memberships_select_self ON public.account_memberships
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Personal-account membership invariants ─────────────────────────────────
--
-- For accounts of type 'personal' the lone allowed membership row must:
--   (a) belong to that account's owner_user_id (prevents the bad state
--       where a personal account has exactly one membership but it
--       belongs to the wrong user),
--   (b) carry role = 'owner',
--   (c) be the only membership row for the account.
--
-- Trigger evaluates these before the row CHECK constraint on role kicks
-- in so that, after Phase D relaxes the role CHECK, the personal-account
-- invariant still rejects 'admin' / 'member' for personal accounts via
-- the trigger reason. Stable error prefix
-- `account_memberships_personal_invariant_violation` so tests can match on it.
--
-- Phase D MUST extend (not replace) this function so the personal-account
-- branch stays intact while team/org accounts get their own (looser) rules.

CREATE OR REPLACE FUNCTION public.account_memberships_enforce_personal_invariants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_type text;
  v_owner_user_id uuid;
  v_existing_count int;
BEGIN
  SELECT a.type, a.owner_user_id
    INTO v_type, v_owner_user_id
    FROM public.accounts a
   WHERE a.id = NEW.account_id;

  -- No account row found — let the FK violation surface from the row write itself.
  IF v_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Non-personal accounts: this trigger is a no-op in this slice. Phase D
  -- extends this branch with its own invariants.
  IF v_type <> 'personal' THEN
    RETURN NEW;
  END IF;

  IF NEW.role <> 'owner' THEN
    RAISE EXCEPTION
      'account_memberships_personal_invariant_violation: personal account membership role must be ''owner'' (got %)',
      NEW.role;
  END IF;

  IF NEW.user_id <> v_owner_user_id THEN
    RAISE EXCEPTION
      'account_memberships_personal_invariant_violation: personal account membership user_id must equal accounts.owner_user_id (account=%, got user=%, owner=%)',
      NEW.account_id, NEW.user_id, v_owner_user_id;
  END IF;

  -- Count existing membership rows for this account excluding the row being
  -- updated in place (TG_OP = 'UPDATE') so an UPDATE of an existing
  -- membership doesn't trip the single-membership check against itself.
  SELECT count(*)
    INTO v_existing_count
    FROM public.account_memberships am
   WHERE am.account_id = NEW.account_id
     AND NOT (TG_OP = 'UPDATE'
              AND am.account_id = NEW.account_id
              AND am.user_id = NEW.user_id);

  IF v_existing_count >= 1 THEN
    RAISE EXCEPTION
      'account_memberships_personal_invariant_violation: personal account already has a membership (account=%)',
      NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER account_memberships_enforce_personal_invariants
  BEFORE INSERT OR UPDATE ON public.account_memberships
  FOR EACH ROW EXECUTE FUNCTION public.account_memberships_enforce_personal_invariants();

-- ── Backfill ───────────────────────────────────────────────────────────────
--
-- The personal-invariants trigger exists above this point so the backfill
-- itself exercises it. Any pre-existing inconsistency in auth.users that
-- would violate it surfaces during migration, not in production.
--
-- Idempotent: re-running produces zero new rows.
--   - accounts: ON CONFLICT DO NOTHING relies on the unique partial
--     index `accounts_one_personal_per_user`. A re-run of the SELECT
--     produces the same set of (user_id, 'personal') candidates; the
--     index causes the second insert per user to no-op.
--   - account_memberships: the composite PK (account_id, user_id) plus
--     ON CONFLICT DO NOTHING produces the same idempotency.

INSERT INTO public.accounts (type, name, owner_user_id)
SELECT 'personal', 'Personal', id FROM auth.users
ON CONFLICT DO NOTHING;

INSERT INTO public.account_memberships (account_id, user_id, role)
SELECT a.id, a.owner_user_id, 'owner'
  FROM public.accounts a
 WHERE a.type = 'personal'
ON CONFLICT DO NOTHING;

-- ── Signup provisioning ────────────────────────────────────────────────────
--
-- Extend handle_new_user so new signups atomically get their personal
-- account + owner membership alongside user_profiles + user_billing.
-- Passes the personal-invariants trigger by construction: NEW.id ==
-- accounts.owner_user_id, role = 'owner', and no prior membership exists
-- for the just-inserted account.
--
-- SECURITY DEFINER is justified for the same reason as the original
-- (only Supabase Auth inserts auth.users; the function runs with owner
-- privileges so it bypasses RLS for these seed inserts).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  INSERT INTO public.user_billing (user_id) VALUES (NEW.id);

  INSERT INTO public.accounts (type, name, owner_user_id)
    VALUES ('personal', 'Personal', NEW.id)
    RETURNING id INTO v_account_id;

  INSERT INTO public.account_memberships (account_id, user_id, role)
    VALUES (v_account_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;
