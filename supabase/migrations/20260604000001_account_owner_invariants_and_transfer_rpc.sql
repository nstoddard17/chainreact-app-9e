-- ChainReactV2 — team/org owner invariants + atomic ownership-transfer RPC
-- (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-2 / TL-1).
--
-- Plan: docs/slices/phase-4/account-owner-transfer-leave-plan.md (commit 76971cf30).
--
-- This migration adds the DB-level foundation for owner transfer + leave team.
-- It does NOT add any public route, UI, leave path, step-up, or deletion-guard
-- change — only the database invariants + the service-role-only swap RPC.
--
-- What it adds:
--   1. account_memberships_enforce_team_owner_invariants — refuses dropping the
--      LAST owner of an ACTIVE team/org account, whether by DELETE (leave/remove)
--      or by UPDATE-away-from-owner (demotion). Personal accounts are untouched
--      (their existing account_memberships_enforce_personal_invariants trigger +
--      the owner_user_id RESTRICT FK keep governing them). Account teardown still
--      works: an FK ON DELETE CASCADE deletes the parent `accounts` row first, so
--      inside this BEFORE DELETE trigger the parent is already gone (type IS NULL)
--      and the membership delete is allowed — only DIRECT deletes against a live
--      account are guarded. Frozen / pending_deletion accounts are likewise
--      allowed to tear down.
--   2. accounts_enforce_owner_is_member — on any change to accounts.owner_user_id,
--      requires the new owner to already hold a role='owner' membership of that
--      account. Keeps owner_user_id from drifting away from owner-membership state.
--      UPDATE-only (account creation INSERTs the account before its membership).
--   3. transfer_account_ownership(p_account_id, p_current_owner_user_id,
--      p_target_user_id) — SECURITY DEFINER, service-role-only. Atomically:
--      validates team/org + active + expected current owner + target-is-member,
--      promotes target to owner, repoints accounts.owner_user_id, demotes the old
--      owner to admin. "transfer and leave" is intentionally NOT here — the leave
--      variant needs application offboarding (soft-disconnect) and is TL-2 service
--      orchestration layered on top of this swap.
--
-- Stable error prefixes (tests match on them):
--   account_memberships_team_owner_invariant_violation
--   accounts_owner_consistency_violation
--   transfer_account_ownership_error
--
-- No new table → the CREATE TABLE migration-RLS lint does not apply. No RLS
-- policy change; no table/column/FK change; no data writes. Idempotent:
-- CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS before each CREATE TRIGGER.

-- ── 1. Team/org >=1-owner invariant ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.account_memberships_enforce_team_owner_invariants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_type text;
  v_deletion_status text;
  v_other_owners int;
BEGIN
  -- Only an owner row can threaten the >=1-owner invariant.
  IF OLD.role <> 'owner' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- UPDATE that keeps the row an owner changes nothing relevant.
  IF TG_OP = 'UPDATE' AND NEW.role = 'owner' THEN
    RETURN NEW;
  END IF;

  SELECT a.type, a.deletion_status
    INTO v_type, v_deletion_status
    FROM public.accounts a
   WHERE a.id = OLD.account_id;

  -- Parent account already gone (FK ON DELETE CASCADE deletes the parent first):
  -- the whole account is being torn down, so let the membership delete through.
  IF v_type IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Personal accounts: governed by account_memberships_enforce_personal_invariants
  -- + the owner_user_id RESTRICT FK. This guard is a no-op for them.
  IF v_type = 'personal' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Frozen / pending_deletion team/org account: allow teardown.
  IF v_deletion_status IS DISTINCT FROM 'active' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Active team/org account: refuse if this was the last owner.
  SELECT count(*)
    INTO v_other_owners
    FROM public.account_memberships m
   WHERE m.account_id = OLD.account_id
     AND m.role = 'owner'
     AND m.user_id <> OLD.user_id;

  IF v_other_owners = 0 THEN
    RAISE EXCEPTION
      'account_memberships_team_owner_invariant_violation: account % must keep at least one owner (cannot % its last owner)',
      OLD.account_id, lower(TG_OP);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS account_memberships_enforce_team_owner_invariants
  ON public.account_memberships;
CREATE TRIGGER account_memberships_enforce_team_owner_invariants
  BEFORE UPDATE OR DELETE ON public.account_memberships
  FOR EACH ROW EXECUTE FUNCTION public.account_memberships_enforce_team_owner_invariants();

-- ── 2. accounts.owner_user_id <-> owner-membership consistency ───────────────

CREATE OR REPLACE FUNCTION public.accounts_enforce_owner_is_member()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_owner boolean;
BEGIN
  -- Only act when owner_user_id actually changes (skip name / deletion_status /
  -- updated_at-only updates).
  IF NEW.owner_user_id IS NOT DISTINCT FROM OLD.owner_user_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.account_memberships m
     WHERE m.account_id = NEW.id
       AND m.user_id = NEW.owner_user_id
       AND m.role = 'owner'
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION
      'accounts_owner_consistency_violation: owner_user_id % must reference an existing owner membership of account %',
      NEW.owner_user_id, NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_enforce_owner_is_member ON public.accounts;
CREATE TRIGGER accounts_enforce_owner_is_member
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_enforce_owner_is_member();

-- ── 3. Atomic ownership-transfer RPC (service-role only) ─────────────────────
--
-- SECURITY DEFINER so it runs with owner privileges (bypasses RLS for the swap),
-- but the two invariant triggers above still fire and validate the end state.
-- The internal write order keeps every intermediate state valid:
--   (1) promote target to owner  → two owners briefly,
--   (2) repoint owner_user_id     → consistency trigger sees target IS an owner,
--   (3) demote old owner to admin → >=1-owner trigger sees target still an owner.
-- FOR UPDATE on the account row serializes concurrent transfers.

CREATE OR REPLACE FUNCTION public.transfer_account_ownership(
  p_account_id uuid,
  p_current_owner_user_id uuid,
  p_target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_deletion_status text;
  v_owner uuid;
  v_target_is_member boolean;
BEGIN
  SELECT a.type, a.deletion_status, a.owner_user_id
    INTO v_type, v_deletion_status, v_owner
    FROM public.accounts a
   WHERE a.id = p_account_id
   FOR UPDATE;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'transfer_account_ownership_error: account % not found', p_account_id;
  END IF;

  IF v_type = 'personal' THEN
    RAISE EXCEPTION
      'transfer_account_ownership_error: cannot transfer a personal account (%)', p_account_id;
  END IF;

  IF v_deletion_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION
      'transfer_account_ownership_error: account % is not active', p_account_id;
  END IF;

  IF v_owner <> p_current_owner_user_id THEN
    RAISE EXCEPTION
      'transfer_account_ownership_error: current owner mismatch for account % (expected %, actual %)',
      p_account_id, p_current_owner_user_id, v_owner;
  END IF;

  IF p_target_user_id = p_current_owner_user_id THEN
    RAISE EXCEPTION
      'transfer_account_ownership_error: target user % is already the owner', p_target_user_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.account_memberships m
     WHERE m.account_id = p_account_id
       AND m.user_id = p_target_user_id
  ) INTO v_target_is_member;

  IF NOT v_target_is_member THEN
    RAISE EXCEPTION
      'transfer_account_ownership_error: target user % is not a member of account %',
      p_target_user_id, p_account_id;
  END IF;

  -- (1) promote target to owner.
  UPDATE public.account_memberships
     SET role = 'owner'
   WHERE account_id = p_account_id
     AND user_id = p_target_user_id;

  -- (2) repoint the account owner.
  UPDATE public.accounts
     SET owner_user_id = p_target_user_id,
         updated_at = now()
   WHERE id = p_account_id;

  -- (3) demote the previous owner to admin.
  UPDATE public.account_memberships
     SET role = 'admin'
   WHERE account_id = p_account_id
     AND user_id = p_current_owner_user_id;
END;
$$;

-- Service-role only. Never PUBLIC / anon / authenticated — this swap must be
-- unreachable from the Data API and only callable by the gated server service
-- (TL-2). A member must NEVER be able to self-escalate to owner via the API.
REVOKE ALL ON FUNCTION public.transfer_account_ownership(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_account_ownership(uuid, uuid, uuid) TO service_role;
