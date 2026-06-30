-- ChainReactV2 — internal_admins: ChainReact COMPANY-internal admin allowlist.
--
-- This table is the source of truth for "is this user a ChainReact internal
-- (company) admin" — Marcus, his partner, and future internal staff. It is
-- DELIBERATELY SEPARATE from the customer account model (accounts /
-- account_memberships / owner|admin|member roles). Being an account owner, team
-- admin, or org admin grants ZERO access to internal surfaces. The only way to
-- be an internal admin is to have a row here.
--
-- Membership is MANAGED OUT OF BAND by service-role only (SQL console / a future
-- internal tool). There is intentionally NO authenticated INSERT/UPDATE/DELETE
-- policy, so a regular signed-in user can never grant themselves internal-admin
-- (default-deny on writes). The single authenticated read policy is select-OWN:
-- a user may confirm THEIR OWN membership (which the auth gate needs) but can
-- NEVER enumerate the internal-admin roster or learn who else is an admin.
--
-- Future swap: if internal admin grows capabilities/roles, add columns here (or
-- a sibling table) WITHOUT changing the gate's call shape — the gate asks only
-- "is user X an internal admin?", which this table answers.

CREATE TABLE public.internal_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Human-readable snapshot for the SQL console; identity is the user_id, never
  -- this column (an email can change). The gate matches on user_id only.
  email text,
  -- Free-text note, e.g. 'founder', 'support', 'eng'. Never security-bearing.
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Who granted this row (NULL for the first SQL-seeded admin). SET NULL so a
  -- granter's account deletion never cascades away an internal-admin grant.
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT internal_admins_text_len_chk CHECK (
    (email IS NULL OR char_length(email) <= 320)
    AND (note IS NULL OR char_length(note) <= 256)
  )
);

ALTER TABLE public.internal_admins ENABLE ROW LEVEL SECURITY;

-- Explicit Data API grants (least privilege; required after Oct 30, 2026).
-- authenticated may only SELECT, and RLS narrows that to the caller's OWN row.
-- All writes (granting/revoking internal admin) are service-role only.
GRANT SELECT ON public.internal_admins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_admins TO service_role;

-- Read OWN row only. This is exactly what the auth gate needs ("am I an internal
-- admin?") and nothing more — a caller can never read another user's row, so the
-- internal-admin roster is non-enumerable by authenticated users.
CREATE POLICY internal_admins_select_own ON public.internal_admins
  FOR SELECT USING (auth.uid() = user_id);

CREATE TRIGGER internal_admins_set_updated_at
  BEFORE UPDATE ON public.internal_admins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seeding the first internal admin (run as service-role, e.g. the Supabase SQL
-- editor; there is no UI for this and no authenticated write policy). Resolve the
-- user_id from auth.users by email so no UUID is hard-coded:
--
--   INSERT INTO public.internal_admins (user_id, email, note)
--   SELECT id, email, 'founder'
--   FROM auth.users
--   WHERE lower(email) = lower('you@example.com')
--   ON CONFLICT (user_id) DO NOTHING;
