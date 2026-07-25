-- ChainReactV2 — atomic invitation email replacement (TEAM-INVITATION-LIFECYCLE-2A).
--
-- Changing an invitation's email must REPLACE it: revoke the old invite and
-- create the new one (new token hash, same role, new address). Doing that as
-- two sequential Data API calls is not atomic — a failed insert (e.g. the new
-- address already has a pending invite → the partial-unique index fires) would
-- strand a committed revoke with NO replacement. This RPC performs both writes
-- in ONE transaction (a single PostgREST RPC call = one transaction): any
-- failure rolls back everything, leaving the old invitation pending and its
-- link fully usable. Email sending stays in the application layer and happens
-- only AFTER this function has committed.
--
-- Failure contract (mapped by repositories/accountInvitations.ts):
--   - 'INVITATION_NOT_PENDING'  (errcode P0001) — the (id, account) row is
--     absent, in another account, or already settled. Nothing changed.
--   - unique_violation (23505)  — the new address already has a pending invite
--     in this account. The revoke ROLLS BACK; the old invitation stays pending.
--
-- SECURITY: service_role-only EXECUTE (the invitation service is the sole
-- caller; it owns the pre-checks: authz via route, frozen account, already-
-- member, send throttle). SECURITY DEFINER with a pinned search_path, matching
-- the repo's hardened-function conventions. Role is preserved server-side from
-- the row being replaced — the caller cannot change role and email in one call.
--
-- ROLLBACK (forward-only repo; for reference):
--   DROP FUNCTION public.replace_account_invitation(uuid, uuid, text, text, uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.replace_account_invitation(
  p_invitation_id uuid,
  p_account_id uuid,
  p_new_email text,
  p_new_token_hash text,
  p_invited_by_user_id uuid,
  p_now timestamptz
)
RETURNS public.account_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_new public.account_invitations;
BEGIN
  -- Revoke the old invite; capture its role for the replacement. The status
  -- filter makes settled/foreign rows a no-op → typed failure, nothing changed.
  UPDATE public.account_invitations
     SET status = 'revoked', revoked_at = p_now
   WHERE id = p_invitation_id
     AND account_id = p_account_id
     AND status = 'pending'
  RETURNING role INTO v_role;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'INVITATION_NOT_PENDING';
  END IF;

  -- New invitation: new address + new token hash, SAME role, non-expiring
  -- (expires_at stays NULL per 20260804000000). A 23505 here (pending invite
  -- already exists for the new address) aborts the whole function — including
  -- the revoke above.
  INSERT INTO public.account_invitations
    (account_id, email, role, token_hash, invited_by_user_id)
  VALUES
    (p_account_id, p_new_email, v_role, p_new_token_hash, p_invited_by_user_id)
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

-- Service-role only — never PUBLIC / anon / authenticated.
REVOKE ALL ON FUNCTION public.replace_account_invitation(uuid, uuid, text, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_account_invitation(uuid, uuid, text, text, uuid, timestamptz) TO service_role;
