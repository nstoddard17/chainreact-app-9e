-- ChainReactV2 — atomic deletion-authorization consumption + pending-deletion transition.
--
-- ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1A.
--
-- WHY THIS EXISTS
-- ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1 spent the user's verified email
-- challenge in one Data API call and then performed the freeze + audit-row write
-- in two more. Consume-first made a REPLAY impossible, but it left three
-- inconsistent outcomes on the failure side:
--
--   1. the sole-owner precondition refused AFTER the code was already spent, so a
--      user who still owned a Team lost their code and had to request another;
--   2. a failed `accounts` UPDATE (or a failed `account_deletions` INSERT) left the
--      authorization permanently consumed with NO deletion scheduled;
--   3. the freeze and its audit row could diverge — the account could be frozen
--      with no `pending` audit row if the second write failed.
--
-- A single PostgREST RPC call is ONE transaction, so this function gives the three
-- writes one consistent outcome: either the challenge is consumed AND the account
-- is frozen AND the audit row exists, or nothing happened at all.
--
-- CONCURRENCY
-- `SELECT … FOR UPDATE` on the account row serializes concurrent final
-- submissions. The first caller consumes + transitions and commits; the second
-- then observes `pending_deletion` and returns `already_pending` WITHOUT consuming
-- a second authorization and WITHOUT writing a second audit row. Two concurrent
-- submissions therefore produce exactly one transition.
--
-- ELIGIBILITY IS RE-CHECKED IN-TRANSACTION
-- The sole-owner precondition is evaluated by the service before this call (so the
-- refusal can carry the actionable account list), and AGAIN here inside the
-- transaction. That closes the window in which a user acquires Team/Business
-- ownership between the check and the write: the function returns
-- `owned_accounts_block` and the challenge consumption rolls back with everything
-- else, so the user keeps their still-valid code.
--
-- SCOPE: this does NOT introduce a second deletion lifecycle. It performs exactly
-- the two writes `services/accounts/accountDeletion.ts` already performed
-- (`accounts` freeze + `account_deletions` pending row), with the challenge
-- consumption folded into the same transaction. Billing wind-down deliberately
-- stays OUTSIDE — it is an external, retry-safe call that must not hold a DB
-- transaction open, and the existing freeze-first ordering + honest
-- partial-failure contract depend on it running after the durable transition.
--
-- SECURITY: service_role-only EXECUTE. SECURITY DEFINER with a pinned search_path,
-- matching `replace_account_invitation` and the repo's hardened-function
-- conventions. Every challenge binding (user, purpose, session, email digest) is
-- re-asserted in the UPDATE's WHERE clause, so this function cannot be used to
-- spend a challenge that does not belong to the account being deleted.
--
-- ROLLBACK (forward-only repo; for reference):
--   DROP FUNCTION public.schedule_account_deletion(uuid, uuid, timestamptz, timestamptz, uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.schedule_account_deletion(
  p_account_id uuid,
  p_requested_by_user_id uuid,
  p_requested_at timestamptz,
  p_purge_after timestamptz,
  -- Challenge to spend. NULL = no authorization to consume (system / admin /
  -- billing-retry paths), in which case only the transition is performed.
  p_challenge_id uuid,
  p_challenge_user_id uuid,
  p_challenge_purpose text,
  p_challenge_session_binding text,
  p_challenge_email_binding text
)
RETURNS TABLE (
  -- 'scheduled' | 'already_pending' | 'no_authorization' | 'owned_accounts_block'
  -- | 'account_not_found'
  out_outcome text,
  out_account_id uuid,
  out_deletion_status text,
  out_deletion_requested_at timestamptz,
  out_purge_after timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.accounts%ROWTYPE;
  v_consumed uuid;
  v_owned_count integer;
BEGIN
  -- Serialize concurrent final submissions on this account.
  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'account_not_found'::text, NULL::uuid, NULL::text,
                        NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  -- Idempotent already-pending path: no second transition, no second audit row,
  -- and NO authorization spent for a transition that does not happen. The caller
  -- still performs its (idempotent) billing retry on this outcome.
  IF v_account.deletion_status = 'pending_deletion' THEN
    RETURN QUERY SELECT 'already_pending'::text, v_account.id, v_account.deletion_status,
                        v_account.deletion_requested_at, v_account.purge_after;
    RETURN;
  END IF;

  -- Sole-owner precondition, re-evaluated inside the transaction. Personal
  -- accounts only: deleting a team/org account IS the resolution of its ownership.
  IF v_account.type = 'personal' THEN
    SELECT count(*) INTO v_owned_count
      FROM public.accounts owned
     WHERE owned.owner_user_id = v_account.owner_user_id
       AND owned.type IN ('team', 'organization');

    IF v_owned_count > 0 THEN
      RETURN QUERY SELECT 'owned_accounts_block'::text, v_account.id, v_account.deletion_status,
                          v_account.deletion_requested_at, v_account.purge_after;
      RETURN;
    END IF;
  END IF;

  -- Spend the authorization. Every binding is re-asserted here, so a challenge
  -- belonging to another user, session, purpose, or (now-changed) email address
  -- cannot be consumed, and an expired / unverified / already-spent one matches
  -- nothing.
  IF p_challenge_id IS NOT NULL THEN
    UPDATE public.sensitive_action_challenges
       SET consumed_at = p_requested_at
     WHERE id = p_challenge_id
       AND user_id = p_challenge_user_id
       AND purpose = p_challenge_purpose
       AND session_binding = p_challenge_session_binding
       AND email_binding = p_challenge_email_binding
       AND consumed_at IS NULL
       AND invalidated_at IS NULL
       AND verified_at IS NOT NULL
       AND verification_expires_at > p_requested_at
       AND expires_at > p_requested_at
    RETURNING id INTO v_consumed;

    IF v_consumed IS NULL THEN
      RETURN QUERY SELECT 'no_authorization'::text, NULL::uuid, NULL::text,
                          NULL::timestamptz, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  -- The durable transition. Identical to what the service wrote before.
  UPDATE public.accounts
     SET deletion_status = 'pending_deletion',
         deletion_requested_at = p_requested_at,
         deletion_requested_by = p_requested_by_user_id,
         purge_after = p_purge_after
   WHERE id = p_account_id
  RETURNING * INTO v_account;

  INSERT INTO public.account_deletions
    (account_id, owner_user_id, status, requested_at, requested_by_user_id, purge_after)
  VALUES
    (p_account_id, v_account.owner_user_id, 'pending', p_requested_at,
     p_requested_by_user_id, p_purge_after);

  RETURN QUERY SELECT 'scheduled'::text, v_account.id, v_account.deletion_status,
                      v_account.deletion_requested_at, v_account.purge_after;
END;
$$;

-- Service-role only — never PUBLIC / anon / authenticated.
REVOKE ALL ON FUNCTION public.schedule_account_deletion(uuid, uuid, timestamptz, timestamptz, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_account_deletion(uuid, uuid, timestamptz, timestamptz, uuid, uuid, text, text, text) TO service_role;
