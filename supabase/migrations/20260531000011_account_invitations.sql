-- ChainReactV2 — account invitations (Slice 4.ACCOUNT-MODEL-15, Phase D D2a).
--
-- Lets an owner/admin invite a person (by email) to a team/org account as
-- 'admin' or 'member'. Token-based, expiring, with a pending/accepted/expired/
-- revoked lifecycle. Backend-only: no visible UI, no outbound email (the raw
-- token is returned once at creation; only its hash is stored). 'owner' is never
-- invitable (owner arrives via creation or future transfer).
--
-- Writes are service-role only (the invitation services use the service-role
-- client, matching the no-client-write rule for account tables). Owners/admins
-- read pending invites via the SELECT policy below; the invitee never reads the
-- row — acceptance resolves by token server-side.

CREATE TABLE public.account_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  -- SHA-256 hash of the opaque token; the raw token is NEVER stored.
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- At most one LIVE (pending) invite per (account, email). Accepted/expired/
-- revoked rows don't block a fresh invite.
CREATE UNIQUE INDEX account_invitations_one_pending_per_email
  ON public.account_invitations (account_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX account_invitations_account_id_idx
  ON public.account_invitations (account_id);

ALTER TABLE public.account_invitations ENABLE ROW LEVEL SECURITY;

-- Data API access (required after Supabase removes implicit grants).
GRANT SELECT ON public.account_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_invitations TO service_role;

-- Owners + admins of the account can read its invitations (the pending list).
-- No client INSERT/UPDATE/DELETE policy — every write is service-role.
CREATE POLICY account_invitations_select_owner_admin ON public.account_invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = account_invitations.account_id
        AND am.role IN ('owner', 'admin')
    )
  );

-- In-app notification type for invites (best-effort surface for already-
-- registered invitees). ADD VALUE is safe in a PG15 migration txn since the new
-- value is not USED in this same transaction.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'account_invitation';

-- Service-role-only lookup of a user id by email, for the best-effort
-- existing-invitee notification. SECURITY DEFINER so it can read auth.users;
-- EXECUTE is granted to service_role only (never anon/authenticated), so it is
-- not an email-enumeration oracle for clients.
CREATE OR REPLACE FUNCTION public.find_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_user_id_by_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(text) TO service_role;
