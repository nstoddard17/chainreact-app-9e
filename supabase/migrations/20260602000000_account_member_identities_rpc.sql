-- ChainReactV2 — co-member display identity (Slice 4.TEAM-PAGE-2).
--
-- The members roster needs safe display identity (email + display_name) for
-- co-members, but neither source is client-reachable:
--   - auth.users is not PostgREST-exposed (email lives there).
--   - user_profiles.display_name is RLS owner-only (auth.uid() = id), so a
--     co-member's session can't read another member's row.
--
-- This SECURITY DEFINER RPC closes that gap WITHOUT widening any table's RLS:
-- it returns identity for every member of an account, but ONLY after verifying
-- the CALLER is themselves a member of that account (reusing the existing
-- is_account_member() helper from 4.ACCOUNT-MODEL-16). A non-member gets a
-- 42501 error and zero rows — emails never leak outside an account.
--
-- auth.uid() resolves the caller's JWT inside a SECURITY DEFINER function, so
-- this MUST be called via the session (cookie) client, never service-role.
-- EXECUTE is granted to `authenticated` only (not `anon`) — there is no
-- signed-out caller that should see member identities.
--
-- No new table → the CREATE TABLE migration-RLS lint does not apply. Idempotent.

CREATE OR REPLACE FUNCTION public.get_account_member_identities(p_account_id uuid)
RETURNS TABLE (user_id uuid, email text, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Co-member gate (defense in depth — the API route also checks membership).
  -- is_account_member() is SECURITY DEFINER + checks auth.uid() against the
  -- account, so it cannot be spoofed by the caller.
  IF NOT public.is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'not a member of account %', p_account_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT m.user_id,
           u.email::text AS email,
           p.display_name
    FROM public.account_memberships m
    JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN public.user_profiles p ON p.id = m.user_id
    WHERE m.account_id = p_account_id;
END;
$$;

-- Never PUBLIC / anon — only an authenticated, membership-verified caller.
REVOKE ALL ON FUNCTION public.get_account_member_identities(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_member_identities(uuid) TO authenticated;
