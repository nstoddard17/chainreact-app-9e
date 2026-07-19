-- 5.ONBOARD-1 (verification batch) — harden Data API privileges on the four
-- tables created by the 2026-07-22..24 migration push.
--
-- WHY THIS EXISTS (found by post-apply schema verification, not by review):
-- this Supabase project carries `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES
-- TO anon, authenticated, service_role` (visible in pg_default_acl). Every new
-- table in `public` is therefore created with FULL privileges for `anon` and
-- `authenticated` — SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER —
-- regardless of what the creating migration's own GRANT statements say. A
-- migration that grants narrowly does NOT end up narrow; the surplus has to be
-- revoked explicitly. That is exactly why this repo already carries a revoke
-- series (20260627000000 … 20260701000000) for the earlier tables.
--
-- Verified state before this migration (information_schema.role_table_grants):
--   user_onboarding_states       anon + authenticated → ALL (intended: authenticated SELECT only)
--   onboarding_events            anon + authenticated → ALL (intended: service_role only)
--   account_machine_credentials  anon + authenticated → ALL (intended: NONE — see below)
--   machine_credential_audit     anon + authenticated → ALL (intended: NONE — see below)
--
-- NOT A POLICY CHANGE — this restores each table's DOCUMENTED intent:
--   * 20260723000000 states "no authenticated INSERT/UPDATE/DELETE grant …
--     all writes via the service-role repository".
--   * 20260724000000 states "service-role only, in BOTH directions: no
--     authenticated grant at all".
--   * 20260722000000 states "There is NO `authenticated` GRANT on this table —
--     a client SELECT returns 42501 — so an encrypted secret can never transit
--     the Data API."
-- The machine-credential tables are included because that migration was applied
-- in the same push as the onboarding pair; its ciphertext columns would
-- otherwise be reachable through the Data API by any account member (its RLS
-- membership SELECT policy was designed as defense-in-depth BEHIND a missing
-- grant, not as the only barrier).
--
-- RLS was already fail-closed for writes (RLS denies any command with no
-- matching policy, and only SELECT policies exist), so this is defense-in-depth
-- restoration rather than closing an open write path. The read path on the
-- machine-credential tables is the material one.
--
-- ROLLBACK: re-GRANT the specific privileges; no data is touched.

-- ── onboarding: presentation state (authenticated may SELECT its own row) ────
REVOKE ALL ON public.user_onboarding_states FROM anon;
REVOKE ALL ON public.user_onboarding_states FROM authenticated;
-- Re-grant exactly the intended read path; the row-level scope stays with the
-- existing `user_onboarding_states_select_own_member` policy.
GRANT SELECT ON public.user_onboarding_states TO authenticated;

-- ── onboarding: analytics ledger (service-role only, both directions) ───────
REVOKE ALL ON public.onboarding_events FROM anon;
REVOKE ALL ON public.onboarding_events FROM authenticated;

-- ── machine credentials (encrypted secrets + audit; no client access) ───────
REVOKE ALL ON public.account_machine_credentials FROM anon;
REVOKE ALL ON public.account_machine_credentials FROM authenticated;
REVOKE ALL ON public.machine_credential_audit FROM anon;
REVOKE ALL ON public.machine_credential_audit FROM authenticated;
