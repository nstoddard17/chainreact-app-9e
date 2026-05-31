-- ChainReactV2 — handle_new_user dual-seeds account_billing (Slice 4.ACCOUNT-MODEL-9c).
--
-- 9c moves LIVE billing onto account_billing (the gate/reserve/reconcile/cost-
-- preview production callers now key on workflow.account_id via the account-keyed
-- `_v2` RPCs). New signups must therefore get an account_billing row for their
-- personal account, or the first run would rely on the _v2 self-heal insert.
--
-- DUAL-SEED (deliberately conservative): the existing user_billing insert is
-- KEPT so user_billing stays populated for the one-more-slice deprecation window
-- (the 9b parity test + the Phase-A signup regression test still expect it). A
-- later cleanup slice drops user_billing + the user-keyed RPCs and removes this
-- insert. Order matters: the accounts row must exist before account_billing (FK).
--
-- This is the ONLY DDL in 9c — no table/RPC is renamed or dropped here; the
-- account-keyed `_v2` RPCs from 20260531000001 remain the live account path.
--
-- ROLLBACK: re-CREATE OR REPLACE the prior handle_new_user (from
-- 20260530000000) without the account_billing insert.

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
  -- Retained (deprecated): live billing reads account_billing after 9c; the
  -- user_billing row stays seeded for the deprecation window.
  INSERT INTO public.user_billing (user_id) VALUES (NEW.id);

  INSERT INTO public.accounts (type, name, owner_user_id)
    VALUES ('personal', 'Personal', NEW.id)
    RETURNING id INTO v_account_id;

  INSERT INTO public.account_memberships (account_id, user_id, role)
    VALUES (v_account_id, NEW.id, 'owner');

  -- 4.ACCOUNT-MODEL-9c: the account-scoped billing root (defaults: 100 tasks).
  INSERT INTO public.account_billing (account_id) VALUES (v_account_id);

  RETURN NEW;
END;
$$;
