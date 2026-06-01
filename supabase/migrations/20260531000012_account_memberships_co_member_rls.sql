-- ChainReactV2 — co-member membership visibility (Slice 4.ACCOUNT-MODEL-16, D2b).
--
-- Broadens account_memberships SELECT from "a user sees only their own row" to
-- "a member sees every membership row of accounts they belong to" — needed for
-- the team member list. Writes stay service-role only (no client write policy).
--
-- Recursion note: a naive `EXISTS (SELECT 1 FROM account_memberships ...)` inside
-- account_memberships' OWN policy triggers Postgres "infinite recursion detected
-- in policy". The standard fix is a SECURITY DEFINER helper that checks
-- membership with RLS bypassed inside the function, so the policy never
-- re-enters the table's RLS. auth.uid() still resolves the caller's JWT inside a
-- SECURITY DEFINER function.
--
-- No new table → the CREATE TABLE migration-RLS lint does not apply. Idempotent.

CREATE OR REPLACE FUNCTION public.is_account_member(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_memberships
    WHERE account_id = p_account_id
      AND user_id = auth.uid()
  );
$$;

-- The RLS policy evaluates this in the querying user's request; EXECUTE must be
-- granted to the API roles. The function body runs as owner (RLS-bypassed), but
-- it only ever returns a boolean about the CALLER's own membership.
GRANT EXECUTE ON FUNCTION public.is_account_member(uuid) TO authenticated, anon;

-- Replace self-only SELECT with co-member visibility.
DROP POLICY IF EXISTS account_memberships_select_self ON public.account_memberships;

CREATE POLICY account_memberships_select_co_member ON public.account_memberships
  FOR SELECT
  USING (public.is_account_member(account_id));
