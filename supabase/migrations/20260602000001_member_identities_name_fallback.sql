-- ChainReactV2 — member identity name fallback (Slice 4.TEAM-PAGE-2, follow-up).
--
-- The roster wants a real NAME on the primary line. user_profiles.display_name
-- is frequently null (users rarely set it), but OAuth sign-ups (Google, etc.)
-- carry a name in auth.users.raw_user_meta_data (`full_name` / `name`). This
-- CREATE OR REPLACE widens the RPC's display_name to fall back to that existing
-- auth metadata so a name shows without a separate profile-edit step.
--
-- Signature is unchanged (same RETURNS TABLE shape) — no client/type changes.
-- Same SECURITY DEFINER + co-member gate as the original (20260602000000).
-- Reads only existing data sources; introduces no new table or column.

CREATE OR REPLACE FUNCTION public.get_account_member_identities(p_account_id uuid)
RETURNS TABLE (user_id uuid, email text, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT public.is_account_member(p_account_id) THEN
    RAISE EXCEPTION 'not a member of account %', p_account_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT m.user_id,
           u.email::text AS email,
           -- Prefer an explicitly-set profile name, then the OAuth metadata
           -- name; blank/whitespace values fall through to the next source.
           COALESCE(
             NULLIF(btrim(p.display_name), ''),
             NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
             NULLIF(btrim(u.raw_user_meta_data ->> 'name'), '')
           ) AS display_name
    FROM public.account_memberships m
    JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN public.user_profiles p ON p.id = m.user_id
    WHERE m.account_id = p_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_account_member_identities(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_member_identities(uuid) TO authenticated;
