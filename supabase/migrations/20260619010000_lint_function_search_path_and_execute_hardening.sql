-- ChainReactV2 — Supabase database-linter SECURITY hardening
-- (Slice 4.SECURITY-LINTER-HARDENING-1).
--
-- Clears two classes of Supabase database-advisor (db linter) SECURITY warnings
-- against the live schema. No function body, trigger, RLS policy, table, or
-- column is changed; this migration only adjusts function configuration
-- (search_path) and function-level EXECUTE privileges.
--
--  (A) 0011_function_search_path_mutable — five functions had no pinned
--      search_path. A role-mutable search_path lets a caller-controlled schema
--      shadow unqualified object references inside the function. Fix: pin
--      search_path = public via ALTER FUNCTION. Each body already schema-
--      qualifies its object refs (public.*), so behavior is unchanged.
--
--  (B) 0028 / 0029 *_security_definer_function_executable — SECURITY DEFINER
--      functions reachable by `anon` / `authenticated` through the Data API
--      (/rest/v1/rpc/<fn>). This project's default privileges grant
--      `EXECUTE ON FUNCTIONS TO anon, authenticated, service_role` as NAMED
--      roles, so earlier `REVOKE ... FROM PUBLIC` lines did not remove those
--      per-role grants (identical root cause to 20260605000001). Fix: explicit
--      per-role REVOKE, then re-assert only the grants each function needs.
--
-- Idempotent: ALTER FUNCTION ... SET is repeatable; REVOKE of an unheld
-- privilege is a no-op; GRANT is repeatable.
--
-- ACCEPTED RESIDUAL WARNINGS (revoking would break behavior; both are safe):
--  * is_account_member(uuid) stays EXECUTE-able by `authenticated`. The
--    account_memberships_select_co_member RLS policy calls it during query
--    evaluation in the caller's role; revoking `authenticated` would make every
--    authenticated SELECT on account_memberships fail. It is SECURITY DEFINER
--    only to avoid RLS self-recursion and returns a single boolean about the
--    CALLER's own membership (auth.uid()), so it discloses nothing.
--  * get_account_member_identities(uuid) stays EXECUTE-able by `authenticated`
--    — it IS the Team-roster RPC and self-gates (RAISE 42501 unless
--    is_account_member(p_account_id)), so a non-member receives nothing.
--    anon was already revoked in 20260605000001.
--
-- NOT fixable in SQL (owner action, tracked separately):
--  * auth_leaked_password_protection — a Supabase Auth setting
--    (Authentication → Providers → Password → "Leaked password protection",
--    i.e. HaveIBeenPwned checks), not a database object. Enable it in the
--    dashboard or via the Management API.

-- ── (A) Pin search_path on the five flagged functions ────────────────────────

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.account_memberships_enforce_personal_invariants() SET search_path = public;
ALTER FUNCTION public.account_memberships_enforce_team_owner_invariants() SET search_path = public;
ALTER FUNCTION public.accounts_enforce_owner_is_member() SET search_path = public;
ALTER FUNCTION public.bump_template_usage_counters() SET search_path = public;

-- ── (B1) Trigger functions — never legitimately called via the Data API ──────
-- A trigger function executes as part of the table DML regardless of the
-- invoking user's EXECUTE privilege, so removing anon / authenticated / PUBLIC
-- EXECUTE cannot affect trigger behavior. The function owner (postgres) retains
-- access. handle_new_user additionally runs on auth.users inserts performed by
-- supabase_auth_admin, which is unaffected.

REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.workflow_folders_enforce_same_account_parent()
  FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.workflows_enforce_same_account_folder()
  FROM anon, authenticated, PUBLIC;

-- ── (B2) Service-role-only RPC — lock the durable rate limiter down ──────────
-- The limiter is a server-side chokepoint. Its defining migration
-- (20260608000000) revoked only FROM PUBLIC, leaving the named anon /
-- authenticated default grants in place — meaning it was Data-API-reachable.
-- Remove those explicitly; service_role keeps the grant it actually uses.

REVOKE ALL ON FUNCTION public.increment_api_key_rate_limits(text, text, text, timestamptz, timestamptz)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_api_key_rate_limits(text, text, text, timestamptz, timestamptz)
  TO service_role;

-- ── (B3) RLS helper — drop anon, keep the authenticated grant the policy needs ─
-- account_memberships grants no table privileges to anon, so the
-- account_memberships_select_co_member policy never evaluates for anon and
-- dropping anon EXECUTE affects no flow. `authenticated` MUST keep EXECUTE
-- (see ACCEPTED RESIDUAL WARNINGS above).

REVOKE ALL ON FUNCTION public.is_account_member(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_account_member(uuid) TO authenticated, service_role;
