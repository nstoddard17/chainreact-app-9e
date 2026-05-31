-- ChainReactV2 — relax account type + membership role CHECKs (Slice 4.ACCOUNT-MODEL-13).
--
-- Phase D opens the account model to team/org accounts. This migration ONLY
-- relaxes the two enum CHECK constraints so the new literals are STORABLE; it
-- creates no rows and changes no behavior. The team-creation SERVICE (this slice)
-- is the only writer of 'team' rows. 'organization' is reachable only via the
-- (future) in-place upgrade; 'admin'/'member' roles stay unused until invitations
-- (future). Both are modeled now to avoid a second CHECK migration later.
--
-- UNCHANGED and still enforced:
--   - The personal-account invariants trigger
--     (account_memberships_enforce_personal_invariants) — still requires a
--     single 'owner' membership for type='personal'; it is a no-op for team/org.
--   - accounts_one_personal_per_user partial unique index — still one personal
--     account per user (team/org are unconstrained by it).
--
-- No new table → the CREATE TABLE migration-RLS lint does not apply. Idempotent:
-- introspects + drops the existing CHECK by definition (name-agnostic, like the
-- 10d FK drops), then re-adds a named constraint, so a re-run is a net no-op.

-- accounts.type: personal → personal | team | organization
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.accounts'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%type%personal%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.accounts DROP CONSTRAINT %I', c);
  END IF;
END $$;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_type_check
  CHECK (type IN ('personal', 'team', 'organization'));

-- account_memberships.role: owner → owner | admin | member
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.account_memberships'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%role%owner%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.account_memberships DROP CONSTRAINT %I', c);
  END IF;
END $$;
ALTER TABLE public.account_memberships
  ADD CONSTRAINT account_memberships_role_check
  CHECK (role IN ('owner', 'admin', 'member'));
