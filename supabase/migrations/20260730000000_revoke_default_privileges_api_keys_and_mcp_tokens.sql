-- DB-SECURITY-TEST-REPAIR — restore the DOCUMENTED grant posture on the two
-- secret-hash tables that shipped without an explicit REVOKE.
--
-- WHY THIS EXISTS (found by an empirical grant probe, not by review — the same
-- way 20260725000000 was found): this project carries
-- `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated,
-- service_role` (visible in pg_default_acl). Every new table in `public` is
-- therefore created with FULL privileges for `anon` and `authenticated`
-- REGARDLESS of what the creating migration's own GRANT statements say. A
-- migration that grants narrowly does NOT end up narrow — the surplus has to be
-- revoked explicitly. 20260725000000 did this for four tables from the
-- 2026-07-22..24 push; these two were created EARLIER and were missed.
--
-- Measured state before this migration (authenticated session vs anon, live):
--   account_api_keys      anon 42501 | authenticated OK (reachable, 0 rows via RLS)
--   account_mcp_tokens    anon 42501 | authenticated OK (reachable, 0 rows via RLS)
-- Compare with tables that DO carry an explicit revoke — all deny both roles:
--   account_machine_credentials, integrations, account_resource_links → 42501
--
-- NOT A POLICY CHANGE — this restores each table's own DOCUMENTED intent:
--   * 20260608000000 (account_api_keys) states: "key_hash must NEVER be
--     client-readable, so there is NO `authenticated` GRANT on this table."
--   * account_mcp_tokens states: "there is NO `authenticated` GRANT on this
--     table. All reads flow through the metadata DTOs."
-- Both are true of the SQL those migrations wrote and false of the resulting
-- database, purely because of the default-privileges hazard above.
--
-- EXPOSURE BEING CLOSED: today RLS still returns zero rows to `authenticated`
-- (neither table has a permissive SELECT policy), so no hash has been readable.
-- What was missing is the layer the migrations claim to have: the grant. With
-- only RLS standing, any future permissive SELECT policy — or a policy added for
-- an adjacent feature — would immediately expose `key_hash` / `token_hash`
-- through the Data API. This restores defense in depth to what was documented.
--
-- SAFE TO APPLY: both tables are reached ONLY through their service-role
-- repositories (repositories/accountApiKeys.ts, repositories/accountMcpTokens.ts,
-- both via getServiceRoleClient). No client/browser code queries either table
-- directly, and service_role is unaffected by these REVOKEs. The membership
-- SELECT policies are retained as defense-in-depth behind the closed grant.
--
-- ROLLBACK: re-GRANT the specific privileges; no data is touched.
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_api_keys TO authenticated;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_mcp_tokens TO authenticated;

REVOKE ALL ON public.account_api_keys FROM anon;
REVOKE ALL ON public.account_api_keys FROM authenticated;

REVOKE ALL ON public.account_mcp_tokens FROM anon;
REVOKE ALL ON public.account_mcp_tokens FROM authenticated;
